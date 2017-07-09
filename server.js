const BGGRequest = require('./BGGRequest.js');
const express = require('express');
const app = express();
const cache = require('persistent-cache');
const jsonCache = cache({
    base: '.data',
    name: 'geeklistData',
    duration: 1000 * 60 * 60 //one hour 
})

app.set('view engine', 'vash');
app.use(express.static('public'));

const promotedUsers = ['travisdhill', 'kelann08', 'DrOctashawn'];
const EXTRA_WEIGHT = 1;

// http://expressjs.com/en/starter/basic-routing.html
app.get("/", function (request, response) {
  
  new Promise((resolve, reject) => {
    jsonCache.get('geeklistDataCollection', (err, geeklistDataCollection) => {
      if (err) {
        reject(err);
        return;
      }
      resolve(geeklistDataCollection);
    })
  })
  .catch((err) => {
    response.status(500).render('error', { errorMessage: err.message });
  })
  .then((geeklistDataCollection) => {
    if (!geeklistDataCollection) {
      return updateGeeklistData().then((geeklistDataCollection) => {
        geeklistDataCollection._cache = {
          lastUpdated: (new Date()).toString()
        };
        jsonCache.putSync('geeklistDataCollection', geeklistDataCollection);
        return geeklistDataCollection;
      })
      .catch((err) => {
        response.status(500).render('error', { errorMessage: err.message });
      });
    }
    console.log(geeklistDataCollection.lastUpdated);
    return geeklistDataCollection;
  })
  .then((geeklistDataCollection) => {
    switch (request.query.json ? 'json' : request.accepts(['json', 'html'])) {
      case 'json':
        response.send(geeklistDataCollection.geeklistData);
        break;

      case 'html':
      default:
        response.render('games', geeklistDataCollection);
    }
  });
});
  
function updateGeeklistData() {
  const GEEKLIST_ID = 227177;
  const itemRequests = [];

  return BGGRequest.logIn()
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
        return geeklistData;
      });
  })
  .then((geeklistData) => {
    geeklistData.item.forEach((item) => {
      item.$.thumbsweighted = parseInt(item.$.thumbs, 10) + item.$.thumbedby.reduce((total, item) => {
        return total + ( promotedUsers.indexOf(item) > -1 ? EXTRA_WEIGHT : 0 );
      }, 0);
    });

    geeklistData.item.sort((a,b) => {
      if (b.$.thumbsweighted === a.$.thumbsweighted) {
        return a.$.id - b.$.id;
      }
      return b.$.thumbsweighted - a.$.thumbsweighted;
    });

    const topSoloGameIndex = geeklistData.item.findIndex((item) => {
      return (item.$.gamedata.minplayers[0] == 1);
    });

    const topTwoPlayerGameIndex = geeklistData.item.findIndex((item) => {
      return (item.$.gamedata.minplayers[0] == 2);
    });

    // move selected games to top of list
    const topSoloGame = geeklistData.item[topSoloGameIndex];    
    const topTwoPlayerGame = geeklistData.item[topTwoPlayerGameIndex];

    geeklistData.item = geeklistData.item.filter((item) => {
      return (item.$.id !== topSoloGame.$.id && item.$.id !== topTwoPlayerGame.$.id);
    })

    geeklistData.item.unshift(topTwoPlayerGame);
    geeklistData.item.unshift(topSoloGame);

    BGGRequest.saveItemOrderForGeeklist(GEEKLIST_ID, geeklistData.item.map((item) => item.$.id));

    return { 
      geeklistData, 
      topSoloGame, 
      topTwoPlayerGame, 
      promotedUsers, 
      extra_weight: EXTRA_WEIGHT + 1
    };
  });
}


// listen for requests :)
var listener = app.listen(process.env.PORT, function () {
  console.log('Your app is listening on port ' + listener.address().port);
});
