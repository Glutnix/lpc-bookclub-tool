const axios = require('axios');
const cachios = require('cachios');
const axiosCookieJarSupport = require('node-axios-cookiejar');
const tough = require('tough-cookie');
const querystring = require('querystring');
const parseString = require('xml2js').parseString;
const striptags = require('striptags');

const REQUEST_TIMEOUT_MS = 10000;
const BACKOFF_TIME_MS = 2000;
const MAX_RETRIES = 10;

axiosCookieJarSupport(axios);
const cookieJar = new tough.CookieJar();

class BGGRequest {
  constructor() {
    this.loggedIn = false;
    this.loggedInError = false;

    const apiAxiosClient = axios.create({
      baseURL: 'https://boardgamegeek.com/',
      timeout: REQUEST_TIMEOUT_MS,
      jar: cookieJar,
      withCredentials: true,
      responseType: 'text',
      stdTTL: 300
    });
    
    this.apiClient = cachios.create(apiAxiosClient);
  }

  logIn() {
    this.loggedIn = false;
    let payload = {
      username: process.env.BGG_USERNAME, 
      password: process.env.BGG_PASSWORD,
    };  
    return this.apiClient.post('/login', querystring.stringify(payload))
      .catch((err) => {
        throw new Error(err);
      })
      .then((res) => res.data)
      .then((data) => {
        if (data.indexOf('Invalid Username/Password') !== -1) {
          throw new Error("Invalid Username/Password");
        }
        if (data.indexOf('/user/Glutnix') === -1) {
          throw new Error("Not logged in");
        }
        this.loggedIn = true;
        return data;
      })
  }

  getGeeklist(geeklistId) {
    return this.apiClient.get(`/xmlapi/geeklist/${geeklistId}`)
      .catch((err) => {
        throw new Error(err);
      })
      .then((res) => {
        if (res.data.indexOf("<?xml") > 0) {
          throw new Error('Failed getting the geeklist, malformed response.');
        }
        return res;
      })
      .then((res) => XMLToJSON(res.data))
      .catch((err) => {
        throw err;
      })
      .then((data) => {
        if (!data.geeklist) {
          throw new Error("Response does not contain a geeklist");
        }
        return data.geeklist;
      })
  }

  getThumbsForItem(itemtype, itemid) {
    const payload = {
      action: 'recspy',
      itemtype,
      itemid
    };
    
    return this.apiClient.post('/geekrecommend.php', querystring.stringify(payload))
      .catch((err) => {
        throw new Error(err);
      })
      .then((res) => {
        let thumbs = striptags(res.data);
        thumbs = thumbs.replace(/[\t\n]+/g, ' ');
        thumbs = thumbs.substr("Recommend / Tip Info [X] Recommended By ".length).trim();
        thumbs = thumbs.split(' | ');
        thumbs.pop();
        return thumbs;
      });
  }
  
  getGameDataForItems(itemlist) {
    return this.apiClient.get(`/xmlapi/boardgame/${itemlist.join()}`)
      .catch((err) => {
        throw new Error(err);
      })
      .then((res) => XMLToJSON(res.data))
      .catch((err) => {
        throw err;
      })

      .then((data) => {
        return data.boardgames.boardgame;
      });
  }
  
  saveItemOrderForGeeklist(geeklistId, idArray) {
    const payload = {
      action: 'savereorder',
      ajax: 1,
      listid: geeklistId,
      'itemids[]': idArray,
    };
    
    return this.apiClient.post('/geeklist/reorder/save', querystring.stringify(payload))
      .catch((err) => {
        throw new Error(err);
      });
  }
}

function XMLToJSON(data) {
  return new Promise((resolve, reject) => {
    parseString(data, function (err, result) {    
      if (err) {
        console.error(data);
        reject(err);
      } else {
        resolve(result);
      }
    })
  }).catch((err) => {
    throw new Error(err);
  });
};

// https://boardgamegeek.com/xmlapi/boardgame/192312

module.exports = new BGGRequest();