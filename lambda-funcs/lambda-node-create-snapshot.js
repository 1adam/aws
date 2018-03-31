'use strict';
const aws = require('aws-sdk');
const https = require('https');
const url = require('url');
function findVolId( respData ) {
  let volId = '';
  console.log(respData);
  for (let i = 0; i < respData.Reservations.length ; i++ ) {
    for (let ii = 0; ii < respData.Reservations[i].Instances.length ; ii++ ) {
        for (let bd=0; bd < respData.Reservations[i].Instances[ii].BlockDeviceMappings.length; bd++) {
            volId = respData.Reservations[i].Instances[ii].BlockDeviceMappings[bd].Ebs.VolumeId;
        }
    }
  }
  return volId;
}
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
  let instanceDetails = {};
  let volId = '';
  const ec2 = new aws.EC2({ region: event.ResourceProperties.Region });
  const descInstParams = {
    Filters: [ { Name: 'instance-id', Values: [ event.ResourceProperties.InstanceId ] } ]
  };
  ec2.describeInstances(descInstParams, (err, data) => {
      if (err) {
          responseData = { Error: 'DescribeInstances call failed' };
          console.log(`${responseData.Error}:\n`, err);
      } else {
          responseData = data;
      }
      volId = findVolId( responseData );
      let csRespData = {};
      let mkSnapParams = {
        Description: 'Ubu16-codeDep',
        VolumeId: volId
      };
      ec2.createSnapshot( mkSnapParams, (err, data) => {
        if (err) {
            csRespData = { Error: 'CreateSnapshot call failed' };
            console.log( `${csRespData.Error}:\n`, err);
        } else {
            responseStatus = 'SUCCESS';
            csRespData = data;
        }
        sendResponse(event, callback, context.logStreamName, responseStatus, csRespData);
      });
  });
};