const express = require('express');
const router = express.Router();

const path = require('path');
const fs = require('fs');
const csv = require('csv');
const iconv = require('iconv-lite');
const multiparty = require("multiparty");
const moment = require("moment");

const Prefectures = require('./prefectures.json')

/* GET home page. */
router.get('/', function(req, res, next) {
  res.render('index', { title: 'Express' });
});

/* POST convert */
router.post('/convert', function(req, res, next) {
  var form = new multiparty.Form();
  form.parse(req, async (err, fields, files) => {
    if (err) {
      res.status(403).json({
        error:err
      });
      return;
    }
    // check format
    if (files == null || files.csv == null || files.csv[0] == null) {
      next(new Error("please provide csv"));
      return;
    }

    const uploaded_path = files.csv[0].path;
    const csv_shiftjis_string = await convert(uploaded_path);
    await unlink(uploaded_path);

    let date = new Date();
    let filename = `POST_${moment().format("YYYY_MM_DD_HH:mm")}.csv`

    res.setHeader('Content-disposition', 'attachment; filename='+filename);
    res.set('Content-Type', 'text/csv');
    res.send(csv_shiftjis_string);
  });
});


function parse(file) {
  return new Promise( async (resolve, reject) => {
    var buf = fs.readFileSync(file);
    var string = iconv.decode(buf, 'shift_jis');
    csv.parse(string, function(err, data){
      if (err) {
        reject(err);
        return;
      }
      resolve(data)
    });
  });
}

function stringify(csvdata) {
  return new Promise( async (resolve, reject) => {
    csv.stringify(csvdata, function(err, data){
      if (err) {
        reject(err);
        return;
      }
      var string = iconv.encode(data, 'shift_jis');
      resolve(string);
    });
  });
}

async function convert(filepath) {

  let readed = await parse(filepath);
  if (readed.length < 2) {
    return
  }
  const keys = readed.shift();

  let orders = [];
  for (let i=0; i<readed.length;i++) {
    let obj = readed[i];
    let order = {};
    for (let index = 0; index<keys.length; index++) {
      order[keys[index]] = obj[index];
    }
    orders.push(order);
  }

  // console.log(orders);
  let mustToSend = [
    ['お届け先郵便番号', 'お届け先氏名', 'お届け先敬称', 'お届け先住所1行目', 'お届け先住所2行目', 'お届け先住所3行目', 'お届け先住所4行目', '内容品']
  ]

  for (let i=0; i<orders.length; i++) {
    const order = orders[i];
    if (order['Fulfillment Status'] === 'unfulfilled' && order['Shipping Country'] === 'JP') {


      let province = Prefectures[parseInt(order['Shipping Province'].replace('JP-', ''))-1];
      let address = '';
      address += order['Shipping City']
      address += order['Shipping Street'];
      let splitted = []
      while(address.length > 20) {
        splitted.push(address.substring(0, 20));
        address = address.substring(20);
      }
      splitted.push(address);

      while (splitted.length > 3) {
        splitted[splitted.length-2] = splitted[splitted.length-2] + splitted[splitted.length-1]
        splitted.splice(-1,1)
      }
      while(splitted.length > 4) {
        splitted.shift();
      }

      let shipment = [];
      shipment.push(order['Shipping Zip']);
      shipment.push(order['Shipping Name']);
      shipment.push('様');
      shipment.push(province);
      shipment.push(splitted[0]);
      shipment.push(splitted.length >=2 ? splitted[1] : '');
      shipment.push(splitted.length >=3 ? splitted[2] : '');
      shipment.push(`電子部品。電池なし(obniz*${order['Lineitem quantity']})`);

      console.log(shipment);

      mustToSend.push(shipment)
    }
  }
  return await stringify(mustToSend);
}

function unlink(dir) {
  return new Promise( (resolve, reject) => {
    fs.unlink(dir, (err, data) => {
      if (err) {
        reject(err);
        return;
      }
      resolve(data);
    });
  });
}


module.exports = router;
