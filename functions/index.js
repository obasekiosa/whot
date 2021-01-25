const functions = require("firebase-functions");

// // Create and Deploy Your First Cloud Functions
// // https://firebase.google.com/docs/functions/write-firebase-functions

const admin = require("firebase-admin");
admin.initializeApp();



const gamesRef = admin.firestore().collection('games');
const usersRef = admin.firestore().collection('users');

User = {
  "username": "",
  "first_name": "",
  "last_name": "",
  "middle_name": "",
  "display_name": "",
  "games": [],
  "own_games": 0,
  "email": "",
  "social": {"email": "", "phone": "", "twitter":""},
  "stat": {"won":0, "lost":0, "played": 0, "draw": 0},
  "requests": {"sent": [], "received": []}
}

const SEP = "$";
const GAME_LIMIT = 4;


//
 exports.helloWorld = functions.https.onRequest(async (request, response) => {
   functions.logger.info("Hello logs!", {structuredData: true});
   const writeResult = await admin.firestore().collection('messages').add({name: "original"});
   response.json({result: `Message with ID: ${writeResult.id} added.`});

 });

 exports.createGame = functions.https.onRequest(async (req, res) => {
    // get user details
    let body = req.body;
    let userId = body["user_id"];
    let gameName = body["game_name"];

    if (userId == null) {
      functions.logger.info("Creating game failed", {status: "failed", messgae: "invalid request"});
      res.json({status: "failed", messgae: "Invalid request"});
      return;
    }

    
    // get user
    let user = await usersRef.where("username", "==", userId).get();
    
    if (user == null || user.empty) {
      functions.logger.info("Creating a Game failed", {status: "failed", messgae: "user does not exist"});
      res.json({status: "failed", messgae: "user does not exist"})
      return;
    }

    let currentUser = user.docs[0];
    // console.log(userId);
    // if (user.docs.length > 0) {
    //   console.log(currentUser.data());
    // }  


     functions.logger.info("Creating a Game");

    // get game Number
    let gameNo = currentUser.data()["own_games"];

    if (gameNo >= GAME_LIMIT) {
      res.json({"status": "failure", "message": `number of games limit (${GAME_LIMIT}) reached`});
      return;
    }


     // get referecnce to game collection
     let gameRef = gamesRef.doc(`game${SEP}${userId}${SEP}${gameNo}`);
     let gameId = gameRef.id;

     if (gameName == null || !isValidUsername(gameName)) {
       gameName = gameId;
     }

     // create game meta
     await gamesRef.doc(gameId).create({creator_id: userId, game_id: gameId, players: [userId], game_name: gameName, room_count: 0, capacity: 2});

     // create gameRoom collection
     let gameRoomRef = gamesRef.doc(gameId).collection("gameRoom");

      // create game room meta (room is identified with numbers)
      let roomDoc =  gameRoomRef.doc(`room${SEP}0`);
      let roomId = roomDoc.id;

      await roomDoc.create({creator_id: userId, game_id: gameId, room_id: roomId, state_count : 0})

      // create states collection
      let gameStatesRef = gameRoomRef.doc(roomId).collection("gameStates");
      
      // create initial state
      let initState = gameStatesRef.doc(`state${SEP}0`);


      let result = await initState.create({
        hands: [{
          player_id: userId,
          cards: []
        }],
        id: "0",
        market: ["0", "9"],
        players: [userId]
      });
      
      oldData = currentUser.data();
    
      // console.log(oldData);
      // if ( oldData == null) {
      //   oldData = [];
      // }
      // console.log(oldData);
      // update user data
      await usersRef.doc(currentUser.id).update({
        games: [...oldData["games"], {game_id: gameId, state_id: initState.id, role: "creator"}],
        own_games: oldData["own_games"] + 1
      });

     // get referece to 
     res.json({result, status: "success", gameId, roomId, stateid: initState.id, user_id: userId});
     return;
 });

 exports.createUser = functions.https.onRequest(async (req, res) => {
    
   // get user details
   let username = req.body["username"];

   if (username == null) {
     res.json({status: "failed", message: "invalid request"});
     return;
   }

   if (!isValidUsername(username)) {
     res.json({status: "failed", message: "invalid username"});
     return;
   }

   console.log("here");
   // check user does not already exist
   let user = await usersRef.where("username", "==", username).get();
   if (user == null || !user.empty) {
    res.json({status: "failed", message: "username already exists"});
    return;
   }
   // create default user structure
   let newUser = JSON.parse(JSON.stringify(User));
   newUser['username'] = username;

   let result = await usersRef.doc(username).create(newUser);
   console.log(result.writeTime);

   res.json({status: "success", "user": newUser, "message": `successfull created user ${username}`});
   return;
 });

 exports.updateUser = functions.https.onRequest(async (req, res) => {

 });


 /// game system logic

 exports.joinGame = functions.https.onRequest(async (req, res) => {
    let game_ref = req.body["game_ref"];
    let user_id = req.body["user_id"];

    if (game_ref == null || user_id == null) {
      res.json({"status": "failure", "message": "invalid request"});
      return;
    }

    let ids = game_ref.split(`${SEP}`);
    if (ids.length > 3 || ids.length < 2) {
      functions.logger.info(ids, {"status": "failure", "message": "no such game"});
      res.json({"status": "failure", "message": "no such game"});
      return;
    }

    let creator_id = ids[0];
    let game_num = ids[1];
    let room_num = ids[2] == null ? 0 : ids[2];

    // check if user exists
    let user = await usersRef.where("username", "==", user_id).get();
    if (user == null || user.empty) {
      res.json({"status": "failure", "message": "no such user"});
      return;
    }

    // check user is not already in game;
    let userInfo = user.docs[0].data();
    let gameCount = userInfo["games"].length;
    for (var i = 0; i < gameCount; i++) {
      if (userInfo["games"][i]["game_id"] === `game${SEP}${creator_id}${SEP}${game_num}`) {
        res.json({"status": "failure", "message": "user already participating"});
        return;
      }
    }


   let game = await gamesRef.where("creator_id", "==", creator_id).where("game_id", "==", `game${SEP}${creator_id}${SEP}${game_num}`).get();

   if (game == null || game.empty) {
     res.json({"status": "failed", "message": "game does not exist "});
     return;
   }

   let gameInfo = game.docs[0].data();
   // check if game has reached max capacity
   if (gameInfo["capacity"] == gameInfo["players"].length) {
     res.json({"status": "failed", "message": "game has reached max capacity"});
     return;
   }

   // check if game is ongoing
   if (gameInfo["status"] === "ongoing") {
     res.json({"status": "failed", "message": "game is ongoing"});
     return;
   }

   // join game
   // update game players
   game.docs[0].ref.update({
      "players": [...gameInfo["players"], user_id]
   });

   // update user games
   user.docs[0].ref.update({
     "games": [...user.docs[0].data()["games"], {"game_id": `game${SEP}${creator_id}${SEP}${room_num}`, "role": "participant"}],
   });

   res.json({status: "success", message: "Joined game " + game_ref});
   return;


 })




 // util fuctions
 function isValidUsername(username) {
  var nameRegex = /^[a-zA-Z\-]+$/;
  let valid = username.match(nameRegex);
  if (username.length < 3) {
    valid = null;
  }
  
  if (valid == null) return false;

  return true;

 }
