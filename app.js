const qrcode = require('qrcode');
const express = require('express');
const { body, validationResult } = require('express-validator');
const { phoneNumberFormatter } = require('./helpers/formatter');
const socketIO = require('socket.io');
const http = require('http');
const { Client, MessageMedia, LocalAuth } = require('whatsapp-web.js');
const { response } = require('express');
const fileUpload = require('express-fileupload');
const axios = require('axios');

const port = process.env.PORT || 8000;

const app = express();
const server = http.createServer(app);
const io = socketIO(server);
app.use(express.json());
app.use(express.urlencoded({
    extended: true
}));
app.use(fileUpload({
  debug: false
}));

const client = new Client({
    restartOnAuthFail: true,
    puppeteer: {
        headless: true,
        args: [
            '--no-sandbox',
            '--disable-setuid-sandbox',
            '--disable-dev-shm-usage',
            '--disable-accelerated-2d-canvas',
            '--no-first-run',
            '--no-zygote',
            '--single-process', // <- this one doesn't works in Windows
            '--disable-gpu'
        ],
    },
    authStrategy: new LocalAuth()
});

client.on('ready', () => {
    console.log('Whatsapp Sudah Terhubung..');
});

app.get('/', (req, res) => {
    res.sendFile('tampilan.html', {
        root: __dirname
    });
});

client.on('message', msg => {
    if (msg.body == '!ping') {
        msg.reply('pong');
    } else if (msg.body == 'hallo') {
        msg.reply('Holla');
    }
});

client.initialize();

// koneksi socket io
io.on('connection', function (socket) {
    socket.emit('message', 'Menghubungkan..');

    client.on('qr', (qr) => {
        console.log('QR RECEIVED', qr);
        qrcode.toDataURL(qr, (err, url) => {
            socket.emit('qr', url);
            socket.emit('message', 'Kode QR sudah diterima, silahkan scan! ');
        });
    });
    client.on('ready', () => {
        socket.emit('ready', 'Whatsapp Sudah Terhubung!');
        socket.emit('message', 'Whatsapp Sudah Terhubung!');
    });
    socket.on('ready', function (data) {
        $('#qrcode').hide();
    });
});

const checkRegisteredNumber = async function (number) {
    const isRegistered = await client.isRegisteredUser(number);
    return isRegistered;
}

// send message
app.post('/send-message', [
    body('number').notEmpty(),
    body('message').notEmpty(),
], async (req, res) => {
    const errors = validationResult(req).formatWith(({
        msg
    }) => {
        return msg;
    });

    if (!errors.isEmpty()) {
        return res.status(422).json({
            status: false,
            message: errors.mapped()
        });
    }

    const number = phoneNumberFormatter(req.body.number);
    const message = req.body.message;

    const isRegisteredNumber = await checkRegisteredNumber(number);

    if (!isRegisteredNumber) {
        return res.status(422).json({
            status: false,
            message: 'Nomor Belum Terdaftar di Whatsapp'
        });
    }

    client.sendMessage(number, message).then(response => {
        res.status(200).json({
            status: true,
            response: "Pesan Terkirim"
        });
    }).catch(err => {
        res.status(500).json({
            status: false,
            response: err
        });
    });
});

// send media
app.post('/send-media', async (req, res) => {
  const number = phoneNumberFormatter(req.body.number);
  const caption = req.body.caption;
  const fileUrl = req.body.file;

  // const media = MessageMedia.fromFilePath('./image-example.png');
  // const file = req.files.file;
  // const media = new MessageMedia(file.mimetype, file.data.toString('base64'), file.name);
  let mimetype;
  const attachment = await axios.get(fileUrl, {
    responseType: 'arraybuffer'
  }).then(response => {
    mimetype = response.headers['content-type'];
    return response.data.toString('base64');
  });

  const media = new MessageMedia(mimetype, attachment, 'Media');

  client.sendMessage(number, media, {
    caption: caption
  }).then(response => {
    res.status(200).json({
      status: true,
      response: response
    });
  }).catch(err => {
    res.status(500).json({
      status: false,
      response: err
    });
  });
});

    server.listen(port, function () {
        console.log('App running on *: ' + port);
    });