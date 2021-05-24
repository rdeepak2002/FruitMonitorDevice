// Setup for all libraries
const axios = require('axios');
const admin = require('firebase-admin');
const uuid = require('uuid-v4');

const Mqtt = require('azure-iot-device-mqtt').Mqtt;
const DeviceClient = require('azure-iot-device').Client;
const Message = require('azure-iot-device').Message;

const NodeWebcam = require( "node-webcam" );

const fs = require('fs');

var FormData = require('form-data');

const socketIOClient = require('socket.io-client');
const ENDPOINT = "http://localhost:5000";

// create webcam
const opts = {
    width: 1280,
    height: 720,
    quality: 100,
    frames: 60,
    delay: 0,
    saveShots: true,
    output: "jpeg",
    device: false,
    callbackReturn: "location",
    verbose: false
};

const Webcam = NodeWebcam.create( opts );

// get device info file (or create it if dne)
let deviceInfo = undefined;

try {
    deviceInfo = require('./device.json');

    init();
}
catch(error) {
    console.log("Generating device config...")

    json = {
        id: uuid(),
        status: "pairing",
        ownerId: undefined,
        name: "Fruit Monitor"
    };

    fs.writeFile('device.json', JSON.stringify(json), 'utf8', ()=>{
        console.log("Device config generated!")
        deviceInfo = require('./device.json');

        init();
    });
}

// iot hub connection string
const connectionString = 'HostName=FruitHub.azure-devices.net;DeviceId=MyNodeDevice;SharedAccessKey=ZIj/h8x4qjOgwT87zvYTz528usDT7OeiN8o4IGKbT9s=';

// iot hub client
const client = DeviceClient.fromConnectionString(connectionString, Mqtt);

/**
 * Method to send photo to Azure to be analyzed
 * @param url url of the photo
 */
async function analyze(url) {
    var data = new FormData();
    data.append('image file', fs.createReadStream(url));

    var config = {
    method: 'post',
    url: 'https://fruitvision.cognitiveservices.azure.com/customvision/v3.0/Prediction/a16bd1d4-1eec-495e-82d6-0edbf005757d/classify/iterations/Iteration1/image',
    headers: { 
        'Prediction-Key': 'ff56c613f1ae48bba40bc89bbfb3fc9a', 
        'Content-Type': 'application/octet-stream', 
        ...data.getHeaders()
    },
    data : data
    };

    axios(config)
    .then(function (response) {
        // console.log(JSON.stringify(response.data));
        dataToSend = response.data;
        dataToSend.deviceInfo = deviceInfo;
        dataToSend.imageUrl = base64_encode(url);
        sendIOTMessage(dataToSend);
    })
    .catch(function (error) {
        console.log(error);
    });
}

/**
 * Function to encode image to base 64
 * @param file file to encode
 * @returns base64 string of image
 */
function base64_encode(file) {
    // read binary data
    var bitmap = fs.readFileSync(file);
    // convert binary data to base64 encoded string
    return new Buffer(bitmap).toString('base64');
}

/**
 * Function to send message through Azure IOT Hub
 * @param data 
 */
function sendIOTMessage(data) {
  // Simulate telemetry.
  const message = new Message(JSON.stringify(data));

  // Send the message.
  client.sendEvent(message, function (err) {
    if (err) {
      console.error('send error: ' + err.toString());
    } else {
      console.log('message sent: ' + message.getData());
    }
    console.log();

    // call take photo again
    // takePhoto();
  });
}

/**
 * Function to take a photo from webcam
 */
function takePhoto() {
    // Call Azure image recognition
    Webcam.capture("webcam", function( err, data ) {
        analyze('./webcam.jpg');
    });
}

/**
 * Function called on startup
 */
function init() {
    console.log(deviceInfo);

    const socket = socketIOClient(ENDPOINT);

    socket.on('connect', function (socket) {
        console.log('connected to server!');
    });

    socket.on("pairRequest", data => {
        if(data.deviceId === deviceInfo.id) {
            deviceInfo.status = "paired";
            deviceInfo.owner = data.owner;
            deviceInfo.name = "Fruit Monitor";
        
            fs.writeFile('device.json', JSON.stringify(deviceInfo), 'utf8', ()=>{
                console.log("device paired!")
                deviceInfo = require('./device.json');

                socket.emit("devicePaired", deviceInfo);
            });
        }
    });

    // implementation to take photo every x seconds
    setInterval(function(){
        if(deviceInfo.status !== "paired") {
            console.log("needs to be paired...")
        }
        else {
            takePhoto();
        }
    }, 5000);
}