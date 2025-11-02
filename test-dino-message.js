#!/usr/bin/env node

/**
 * Test script to trigger the dino emoji power-up message via TalkJS
 * This simulates what happens when you collect the dino emoji in the game.
 */

const fs = require('fs');
const path = require('path');
const https = require('https');

// Configuration (from your .env.local)
const TALKJS_APP_ID = 'ty6ueHHy';
const TALKJS_SECRET = 'sk_test_Behn5M5GBNkHI2InqMX5yRhJncr1YQQU';
const TALKJS_HOST = 'durhack.talkjs.com';
const CONVERSATION_ID = 'new_conversation';
const USER_ID = 'test_player_' + Math.random().toString(36).substring(7);

console.log('🦕 Testing Dino TalkJS Message');
console.log('================================\n');

async function uploadFile(fileBuffer, filename, contentType) {
  return new Promise((resolve, reject) => {
    console.log('📤 Step 1: Uploading dino.avif to TalkJS...');
    
    const boundary = '----WebKitFormBoundary' + Math.random().toString(36);
    const bodyParts = [];
    
    // Build multipart form data
    bodyParts.push(Buffer.from(`--${boundary}\r\n`));
    bodyParts.push(Buffer.from(`Content-Disposition: form-data; name="file"; filename="${filename}"\r\n`));
    bodyParts.push(Buffer.from(`Content-Type: ${contentType}\r\n\r\n`));
    bodyParts.push(fileBuffer);
    bodyParts.push(Buffer.from(`\r\n--${boundary}--\r\n`));
    
    const body = Buffer.concat(bodyParts);
    
    const options = {
      hostname: TALKJS_HOST.replace('https://', ''),
      path: `/v1/${TALKJS_APP_ID}/files`,
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${TALKJS_SECRET}`,
        'Content-Type': `multipart/form-data; boundary=${boundary}`,
        'Content-Length': body.length
      }
    };
    
    const req = https.request(options, (res) => {
      let data = '';
      res.on('data', (chunk) => data += chunk);
      res.on('end', () => {
        if (res.statusCode >= 200 && res.statusCode < 300) {
          try {
            const response = JSON.parse(data);
            console.log('✅ Upload successful!');
            console.log('   File token:', response.fileToken || response.token || 'N/A');
            resolve(response.fileToken || response.token);
          } catch (e) {
            console.log('✅ Upload successful! (Raw response)');
            resolve(data);
          }
        } else {
          reject(new Error(`Upload failed: ${res.statusCode} ${data}`));
        }
      });
    });
    
    req.on('error', reject);
    req.write(body);
    req.end();
  });
}

async function sendMessage(fileToken) {
  return new Promise((resolve, reject) => {
    console.log('\n💬 Step 2: Sending message with image...');
    
    const messageData = JSON.stringify({
      text: '',
      sender: USER_ID,
      type: 'UserMessage',
      custom: {
        trigger: 'dino_powerup_test'
      },
      attachment: {
        type: 'file',
        fileToken: fileToken
      }
    });
    
    const options = {
      hostname: TALKJS_HOST.replace('https://', ''),
      path: `/v1/${TALKJS_APP_ID}/conversations/${CONVERSATION_ID}/messages`,
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${TALKJS_SECRET}`,
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(messageData)
      }
    };
    
    const req = https.request(options, (res) => {
      let data = '';
      res.on('data', (chunk) => data += chunk);
      res.on('end', () => {
        if (res.statusCode >= 200 && res.statusCode < 300) {
          console.log('✅ Message sent successfully!');
          console.log('   Conversation ID:', CONVERSATION_ID);
          try {
            const response = JSON.parse(data);
            console.log('   Message ID:', response.id || 'N/A');
          } catch (e) {
            // Response might not be JSON
          }
          resolve(data);
        } else {
          reject(new Error(`Send message failed: ${res.statusCode} ${data}`));
        }
      });
    });
    
    req.on('error', reject);
    req.write(messageData);
    req.end();
  });
}

async function main() {
  try {
    // Read the dino.avif file
    const dinoPath = path.join(__dirname, 'dino.avif');
    
    if (!fs.existsSync(dinoPath)) {
      throw new Error('dino.avif not found at: ' + dinoPath);
    }
    
    console.log('📂 Reading dino.avif from:', dinoPath);
    const fileBuffer = fs.readFileSync(dinoPath);
    console.log('   File size:', (fileBuffer.length / 1024).toFixed(2), 'KB\n');
    
    // Upload the file
    const fileToken = await uploadFile(fileBuffer, 'dino.avif', 'image/avif');
    
    // Send the message
    await sendMessage(fileToken);
    
    console.log('\n🎉 SUCCESS! The dino image has been sent via TalkJS!');
    console.log('   Check your chat interface to see the message.');
    console.log('   Open your main app and look at conversation:', CONVERSATION_ID);
    
  } catch (error) {
    console.error('\n❌ ERROR:', error.message);
    console.error('\nFull error:', error);
    process.exit(1);
  }
}

main();
