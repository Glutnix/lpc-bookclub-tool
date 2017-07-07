const REQUEST_TIMEOUT_MS = 10000;
const BACKOFF_TIME_MS = 2000;
const MAX_RETRIES = 10;

// init project
const express = require('express');
const app = express();
app.set('view engine', 'vash');

const axios = require('axios');
const cachios = require('cachios');
const axiosCookieJarSupport = require('node-axios-cookiejar');
const tough = require('tough-cookie');
const querystring = require('querystring');
const parseString = require('xml2js').parseString;
const striptags = require('striptags');

let loggedIn = false;
let loggedInError = false;

axiosCookieJarSupport(axios);
const cookieJar = new tough.CookieJar();

const apiAxiosClient = axios.create({
  baseURL: 'https://boardgamegeek.com/',
  timeout: REQUEST_TIMEOUT_MS,
  jar: cookieJar,
  withCredentials: true,
  responseType: 'text'
});

const apiClient = cachios.create(apiAxiosClient);

app.use(express.static('public'));

// http://expressjs.com/en/starter/basic-routing.html
app.get("/", function (request, response) {
  const GEEKLIST_ID = 227177;
  const itemRequests = [];
  
  logIn()
    .catch(err => {
      response.status(500).send(err.message);
    })
  .then((loggedinRes) => {
    return getGeeklist(GEEKLIST_ID);
  })
  .then((geeklistData) => {
    geeklistData.item.forEach((item) => {
      itemRequests.push(getThumbsForItem('listitem', item.$.id)
        .then((thumbs) => {
          item.$.thumbedby = thumbs.sort();
        })
      );
    });
    return Promise.all(itemRequests)
      .then((all) => {
      return geeklistData;
    });
  })
  .then((geeklistData) => {
    switch (request.accepts(['json', 'html'])) {
      case 'json':
        response.send(geeklistData);
        break;
      case 'html':
      default:
        response.render('games', { geeklistData });
    }
  })
});


// listen for requests :)
var listener = app.listen(process.env.PORT, function () {
  console.log('Your app is listening on port ' + listener.address().port);
});


function logIn() {
  loggedIn = false;
  let payload = {
    username: process.env.BGG_USERNAME, 
    password: process.env.BGG_PASSWORD,
  };  
  return apiClient.post('/login', querystring.stringify(payload))
    .then((res) => res.data)
    .then((data) => {
      if (data.indexOf('Invalid Username/Password') !== -1) {
        throw new Error("Invalid Username/Password");
      }
      if (data.indexOf('/user/Glutnix') === -1) {
        throw new Error("Not logged in");
      }
      loggedIn = true;
      return data;
    })
}

function getGeeklist(geeklistId) {
  return apiClient.get(`/xmlapi/geeklist/${geeklistId}`)
    .then((res) => res.data)
    .then((data) => {
      return new Promise((resolve, reject) => {
        parseString(data, function (err, result) {    
          if (err) {
            reject(err);
          } else {
            resolve(result);
          }
        })
      });
    })
  .then((data) => {
    if (!data.geeklist) {
      throw new Error("Response does not contain a geeklist");
    }
    return data.geeklist;
  })
}

function getThumbsForItem(itemtype, itemid) {
  const payload = {
    action: 'recspy',
    itemtype,
    itemid
  };
  return apiClient.post('/geekrecommend.php', querystring.stringify(payload))
    .then((res) => {
      let thumbs = striptags(res.data);
      thumbs = thumbs.replace(/[\t\n]+/g, ' ');
      thumbs = thumbs.substr("Recommend / Tip Info [X] Recommended By ".length).trim();
      thumbs = thumbs.split(' | ');
      thumbs.pop();
      return thumbs;
    });
}