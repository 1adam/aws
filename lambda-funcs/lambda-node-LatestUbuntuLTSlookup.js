'use strict';
const aws = require('aws-sdk');
const https = require('https');
const url = require('url');
const isBeta = (imageName) => imageName.toLowerCase().includes('beta') || imageName.toLowerCase().includes('.rc');
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
  const describeImagesParams = {
      Filters: [{ Name: 'name', Values: ['ubuntu/images/hvm-ssd/ubuntu-*-*-amd64-server-*']},
                { Name: 'description', Values: ['*LTS*'] }]
  };
  ec2.describeImages(describeImagesParams, (err, data) => {
      if (err) {
          responseData = { Error: 'DescribeImages call failed' };
          console.log(`${responseData.Error}:\n`, err);
      } else {
          const images = data.Images;
          images.sort((x, y) => y.Name.localeCompare(x.Name));
          for (let i = 0; i < images.length; i++) {
              if (!isBeta(images[i].Name)) {
                  responseStatus = 'SUCCESS';
                  responseData.Id = images[i].ImageId;
                  break;
              }
          }
      }
      sendResponse(event, callback, context.logStreamName, responseStatus, responseData);
  });
};