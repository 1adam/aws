'use strict';
const aws = require('aws-sdk');
const https = require('https');
const url = require('url');
function sendResponse(event, callback, logStreamName, responseStatus, responseData) {
  const responseBody = JSON.stringify({
      Status: responseStatus,
      Reason: `See the details in CloudWatch Log Stream: ${logStreamName}`,
      PhysicalResourceId: logStreamName,
      StackId: event.StackId,
      RequestId: event.RequestId,
      LogicalResourceId: event.LogicalResourceId,
      Data: responseData,
  });
  console.log('RESPONSE BODY:\n', responseBody);
  const parsedUrl = url.parse(event.ResponseURL);
  const options = {
      hostname: parsedUrl.hostname,
      port: 443,
      path: parsedUrl.path,
      method: 'PUT',
      headers: {
          'Content-Type': '',
          'Content-Length': responseBody.length,
      },
  };
  const req = https.request(options, (res) => {
      console.log('STATUS:', res.statusCode);
      console.log('HEADERS:', JSON.stringify(res.headers));
      callback(null, 'Successfully sent stack response!');
  });
  req.on('error', (err) => {
      console.log('sendResponse Error:\n', err);
      callback(err);
  });
  req.write(responseBody);
  req.end();
}
exports.handler = (event, context, callback) => {
  if (event.RequestType === 'Delete') {
      sendResponse(event, callback, context.logStreamName, 'SUCCESS');
      return; }
  let responseStatus = 'FAILED';
  let responseData = {};
  const ec2 = new aws.EC2({ region: event.ResourceProperties.Region });
  const mkImgParams = {
    InstanceId: process.env.INST_ID,
    Name: "ubuntu16-codedeploy_" + Date.now()
  };
  ec2.createImage(mkImgParams, (err, data) => {
    if (err) {
        responseData = { Error: 'CreateImage call failed' };
        console.log(`${responseData.Error}:\n`, err);
    } else {
        responseStatus = 'SUCCESS';
        responseData.ImageId = data.ImageId;
    }
    sendResponse(event, callback, context.logStreamName, responseStatus, responseData);
  });
};