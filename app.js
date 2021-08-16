const { Client, MessageMedia } = require('whatsapp-web.js');
const express = require('express');
const { body, validationResult } = require('express-validator');
const socketIO = require('socket.io');
var qrcode = require('qrcode');
const http = require('http');
const fs = require('fs');
const { phoneNumberFormatter } = require('./helpers/formatter');
const fileUpload = require('express-fileupload');
const axios = require('axios');
const port = process.env.PORT || 8000;

const app = express();
const server = http.createServer(app);
const io = socketIO(server);

app.use(express.json());
app.use(express.urlencoded({extended: true}));
app.use(fileUpload({
    debug: true
}));

const SESSION_FILE_PATH = './wa-session.json';
let sessionCfg;
if (fs.existsSync(SESSION_FILE_PATH)) {
    sessionCfg = require(SESSION_FILE_PATH);
}

app.get('/', (req, res)=>{
    res.sendFile('index.html',{ root: __dirname});
});

const client = new Client({ 
    puppeteer: { 
        headless: true ,
        args: [
            '--no-sandbox',
            '--disable-setuid-sandbox',
            '--disable-dev-shm-usage',
            '--disable-accelerated-2d-canvas',
            '--no-first-run',
            '--no-zygote',
            '--single-process',
            '--disable-gpu',
        ],
    }, 
    session: sessionCfg 
});






client.on('message', msg => {
    if (msg.body == 'apakah masih ada') {
        msg.reply('pong');
    }
    else if (msg.body == 'hi') {
        msg.reply('hello');
    }
});

client.initialize();

// socket io
io.on('connection', function(socket){
    socket.emit('message', 'Connecting...');

    client.on('qr', (qr) => {
        console.log('QR RECEIVED', qr);
        qrcode.toDataURL(qr, (err, url)=>{
            socket.emit('qr', url);
            socket.emit('message', 'Please Scan QR Code');

        });
    });
    client.on('ready', () => {
        socket.emit('ready', 'Connected!');
        socket.emit('message', 'Connected!');
        console.log('connected');
    });

    client.on('authenticated', (session) => {
        socket.emit('authenticated', 'authenticated!');
        socket.emit('message', 'authenticated!');
        console.log('AUTHENTICATED', session);
        sessionCfg=session;
        fs.writeFile(SESSION_FILE_PATH, JSON.stringify(session), function (err) {
            if (err) {
                console.error(err);
            }
        });
    });

});

const checkRegisteredNumber = async function(number){
    const isRegistered = await client.isRegisteredUser(number);
    return isRegistered
}

//send message
app.post('/send-message', [
    body('number').notEmpty(),
    body('message').notEmpty(),
], async (req,res)=>{
    const errors = validationResult(req).formatWith(({ msg })=>{
        return msg;
    });

    if(!errors.isEmpty()){
        return res.status(422).json({
            status:false,
            message: errors.mapped()
        })
    }

    const number = phoneNumberFormatter(req.body.number);
    const message = req.body.message;

    const isRegisteredNumber = await checkRegisteredNumber(number);

    if(!isRegisteredNumber){
        return res.status(422).json({
            status: false,
            message: 'The number is not registered'
        });
    }

    client.sendMessage(number,message).then(response => {
            res.status(200).json({
                status: true,
                response: response
            });
    }).catch(err =>{
        res.status(500).json({
            status:false,
            response: err
        })
    });
});


//send media
app.post('/send-media', async (req,res)=>{
    const number = phoneNumberFormatter(req.body.number);
    const caption = req.body.caption;
    const fileUrl = req.body.file;
    // const media = MessageMedia.fromFilePath('./icon.jpg')

    // const file = req.files.file;
    // const media = new MessageMedia(file.mimetype, file.data.toString('base64'),file.name)

    let mimetype;
    const attachment = await axios.get(fileUrl, { responseType: 'arraybuffer'}).then(response =>{
        mimetype = response.headers['content-type'];
        return response.data.toString('base64');
    });

    const media = new MessageMedia(mimetype, attachment, 'Media')
 


    client.sendMessage(number,media,{caption:caption}).then(response => {
            res.status(200).json({
                status: true,
                response: response
            });
    }).catch(err =>{
        res.status(500).json({
            status:false,
            response: err
        })
    });
});

server.listen(port, function(){
    console.log('App running on *:' + port );
});
