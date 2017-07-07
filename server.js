const BGGRequest = require('./BGGRequest.js');
const express = require('express');
const app = express();
app.set('view engine', 'vash');

app.use(express.static('public'));

// http://expressjs.com/en/starter/basic-routing.html
app.get("/", function (request, response) {
  const GEEKLIST_ID = 227177;
  const itemRequests = [];
  
  BGGRequest.logIn()
    .catch(err => {
      response.status(500).send(err.message);
    })
    .then((loggedinRes) => {
      return BGGRequest.getGeeklist(GEEKLIST_ID);
    })
    .then((geeklistData) => {
      geeklistData.item.forEach((item) => {
        itemRequests.push(BGGRequest.getThumbsForItem('listitem', item.$.id)
          .then((thumbs) => {
            item.$.thumbedby = thumbs.sort();
          })
        );
      });
      const itemlist = geeklistData.item.map((item) => item.$.objectid);
      itemRequests.push(BGGRequest.getGameDataForItems(itemlist)
        .then((allgamedata) => {
          geeklistData.item.forEach((item) => {
            const gameId = item.$.objectid;
            item.$.gamedata = allgamedata.find((game) => game.$.objectid === gameId);
          });
        })
      );

      return Promise.all(itemRequests)
        .then((all) => {
          geeklistData.item.sort((a,b) => {
            return b.$.thumbedby.length - a.$.thumbedby.length;
          });
          return geeklistData;
        });
    })
    .then((geeklistData) => {
      switch (request.query.json ? 'json' : request.accepts(['json', 'html'])) {
        case 'json':
          response.send(geeklistData);
          break;
        case 'html':
        default:
          response.render('games', { geeklistData });
      }
    });
});


// listen for requests :)
var listener = app.listen(process.env.PORT, function () {
  console.log('Your app is listening on port ' + listener.address().port);
});


