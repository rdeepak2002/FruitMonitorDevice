
// Setup for all libraries
const path = require('path');
const axios = require('axios');
const admin = require('firebase-admin');
const uuid = require('uuid-v4');
const Mqtt = require('azure-iot-device-mqtt').Mqtt;
const DeviceClient = require('azure-iot-device').Client;
const Message = require('azure-iot-device').Message;

const { storage } = require('firebase-admin');

// firebase service account
const serviceAccount = require('./goodbadfruit-firebase-adminsdk-61lvl-437de99142.json');

// iot hub connection string
const connectionString = 'HostName=FruitHub.azure-devices.net;DeviceId=MyNodeDevice;SharedAccessKey=ZIj/h8x4qjOgwT87zvYTz528usDT7OeiN8o4IGKbT9s=';

// iot hub client
const client = DeviceClient.fromConnectionString(connectionString, Mqtt);

// init firebase admin
admin.initializeApp({
  credential: admin.credential.cert(serviceAccount),
  storageBucket: 'goodbadfruit.appspot.com'
});

// get storage bucket
const bucket = admin.storage().bucket();

/**
 * Method to upload a photo to gcp, and use send the url of that photo to be processed in Azure
 * @param filePath the local path to the image
 */
async function uploadPhoto(filePath) {
    const photoId = uuid();

    const metadata = {
        metadata: {
            firebaseStorageDownloadTokens: photoId
        },
        contentType: 'image/png',
        cacheControl: 'public, max-age=31536000',
    };

    const fileDest = `captures/${photoId}.jpg`;

    bucket.upload(filePath, {
        gzip: true,
        destination: fileDest,
        metadata: metadata
    }).then((data)=> {        
        const url = "https://firebasestorage.googleapis.com/v0/b/" + bucket.name + "/o/" + encodeURIComponent(fileDest) + "?alt=media&token=" + photoId;        
        analyze(url);
    });
}

/**
 * Method to send photo to Azure to be analyzed
 * @param url url of the photo
 */
async function analyze(url) {
    console.log(`analyzing ${url}`);

    var data = JSON.stringify({
        "Url": url
    });
    
    var config = {
        method: 'post',
        url: 'https://fruitvision.cognitiveservices.azure.com/customvision/v3.0/Prediction/a16bd1d4-1eec-495e-82d6-0edbf005757d/classify/iterations/Iteration1/url',
        headers: { 
            'Prediction-Key': 'ff56c613f1ae48bba40bc89bbfb3fc9a', 
            'Content-Type': 'application/json'
        },
        data : data
    };
    
    axios(config)
    .then(function (response) {
        console.log(response.data);
    })
    .catch(function (error) {
        console.log(error);
    });   
}

/**
 * Function to send message through Azure IOT Hub
 * @param data 
 */
function sendIOTMessage(data) {
  // Simulate telemetry.
  const message = new Message(JSON.stringify(data));

  // Add a custom application property to the message.
  // An IoT hub can filter on these properties without access to the message body.
  message.properties.add('temperatureAlert', (data.temperature > 30) ? 'true' : 'false');

  // Send the message.
  client.sendEvent(message, function (err) {
    if (err) {
      console.error('send error: ' + err.toString());
    } else {
      console.log('message sent: ' + message.getData());
    }
  });
}

// Create a message and send it to the IoT hub every second
setInterval(function(){
    const data = {
        temperature: 20 + (Math.random() * 15),
        humidity: 60 + (Math.random() * 20)
    };

    sendIOTMessage(data);
}, 2000);

// TODO: remove this (its just for testing uploading an image)
uploadPhoto("./capture/help.jpg");
