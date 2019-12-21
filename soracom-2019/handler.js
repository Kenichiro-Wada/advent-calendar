'use strict';
const AWS = require('aws-sdk');
AWS.config.update({ region: 'ap-northeast-1' });
const kms = new AWS.KMS();
const request = require('request-promise');

let slackApiToken;
let postSlackChannelId;
let postSlackChannelName;

const ClickTypeReactions = {
  1: 'thumbsup',
  2: 'ng',
  3: 'hand'
}

module.exports.index = async event => {
  console.log(JSON.stringify(event, 2));
  // 環境変数に設定値を取得
  slackApiToken = await decryptedEnv('SLACK_TOKEN');
  postSlackChannelId = await decryptedEnv('SLACK_CHANNEL_ID');
  postSlackChannelName = await decryptedEnv('SLACK_CHANNEL_NAME');

  let clickType;
  if (event.clickType) {
    clickType = event.clickType;
  } else {
    clickType = event.deviceEvent.buttonClicked.clickType;
  }
  console.log('clickType:', clickType);
  const prevMessageData = await getPrevMessage(event);
  let result = false;
  if (prevMessageData !== null) {
    if (clickType === 1) {
      result = await postMessage(prevMessageData);
    } else {
      result = await postReactions(clickType, prevMessageData.timestamp)
    }
  }
  // Use this code if you don't use the http event with the LAMBDA-PROXY integration
  // return { message: 'Go Serverless v1.0! Your function executed successfully!', event };
  let message;
  let statusCode;
  if (result) {
    message = 'Success!'
    statusCode = 200
  } else {
    statusCode = 500
    message = 'Failure!'
  }
  return {
    statusCode,
    body: JSON.stringify(
      {
        message
      },
      null,
      2
    ),
  };
};
/**
 * 直前メッセージ取得
 * @param {*} event 
 */
async function getPrevMessage(event) {

  const headers = {'Content-type': 'application/json'};
  const options = {
    url: `https://slack.com/api/conversations.history?token=${slackApiToken}&channel=${postSlackChannelId}&limit`,
    method: 'GET',
    headers,
    json: true,
  };
  // Slack APIコール
  console.log(JSON.stringify(options, 2));
  const res = await request(options)
    .then(function (body) {
      console.log('Slack APIコール成功', JSON.stringify(body, 2));
      if (body.ok) {
        const retObj = {
          'user': body.messages[0].user,
          'message': body.messages[0].text,
          'timestamp': body.messages[0].ts
        }
        return retObj
      } else {
        return null
      }

    })
    .catch(function (err) {
      console.log('Slack API Error: ' + err);
      return null
    });
  
  return res
}
/**
 * メッセージ送信
 * @param {*} event 
 * @param {*} prevMessage 
 */
async function postMessage(prevMessageData) {

  let messageArray = [];
  messageArray.push(`<@${prevMessageData.user}> `);
  messageArray.push('の申請を承認します');
  messageArray.push(`申請内容: `);
  messageArray.push(`${prevMessageData.message}`);
  const message = messageArray.join('\n');
  const headers = {
    'content-type' : 'application/x-www-form-urlencoded',
    'charset' : 'utf-8' 
  }
  
  const options = {
    url: 'https://slack.com/api/chat.postMessage',
    method: 'POST',
    headers,
    json: true,
    form : {
      'token': slackApiToken,
      'channel': postSlackChannelName,
      'text': message
    }
  };
  // Slack APIコール
  const res = await request(options)
    .then(function (body) {
      console.log('Slack APIコール成功(postMessage)', JSON.stringify(body, 2));
      if (body.ok) {
        return true;
      } else {
        return false;
      }
    })
    .catch(function (err) {
      console.log('Slack API Error(postMessage): ', err);
      return false
    });
  return res;
}
/**
 * ワークフロー申請用に申請メッセージにリアクション
 * @param {*} event 
 * @param {*} timestamp 
 */
async function postReactions(clickType, timestamp) {
  const reaction = ClickTypeReactions[clickType];
  const headers = {
    'content-type' : 'application/x-www-form-urlencoded',
    'charset' : 'utf-8' 
  }
  const options = {
    url: 'https://slack.com/api/reactions.add',
    method: 'POST',
    headers,
    json: true,
    form : {
      'token':slackApiToken,
      'channel':postSlackChannelId,
      'timestamp': timestamp,
      'name':reaction
    }
  };
  
  const res = await request(options)
    .then(function (body) {
      console.log('Slack APIコール成功(postReactions)', JSON.stringify(body, 2));
      if (body.ok) {
        return true;
      } else {
        return false;
      }
    })
    .catch(function (err) {
      console.log('Slack API Error(postReactions): ', err);
      return false
    });
  return res;

}
/**
 * 環境変数復号化
 * @param {*} decryptedEnvKey 
 */
async function decryptedEnv(decryptedEnvKey) {

  const data = await kms
    .decrypt({
      CiphertextBlob: new Buffer(process.env[decryptedEnvKey], 'base64'),
    })
    .promise();
  return String(data.Plaintext);
}
