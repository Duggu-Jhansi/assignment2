const express = require("express");
const { open } = require("sqlite");
const sqlite3 = require("sqlite3");
const path = require("path");
const bcrypt = require("bcrypt");
const jwt = require("jsonwebtoken");

const databasePath = path.join(__dirname, "twitterClone.db");
const app = express();
app.use(express.json());

let database = null;

const initializeDbAndServer = async () => {
  try {
    database = await open({
      filename: databasePath,
      driver: sqlite3.Database,
    });
    app.listen(3000, () =>
      console.log("Server Running at http://localhost:3000/")
    );
  } catch (error) {
    console.log(`DB Error: ${error.message}`);
    process.exit(1);
  }
};
initializeDbAndServer();

const getFollowingPeopleIdsUser = async (username) => {
  const getFollowingPeopleQuery = `
    SELECT following_user_id from follower
    INNER JOIN user ON user.user_id=follower.follower_user_id
    where user.username='${username}';`;
  const followingPeople = await database.all(getFollowingPeopleQuery);
  const arrayOfIds = followingPeople.map(
    (eachUser) => eachUser.following_user_id
  );
  return arrayOfIds;
};

const authenticateToken = (request, response, next) => {
  let jwtToken;
  const authHeader = request.headers["authorization"];
  if (authHeader !== undefined) {
    jwtToken = authHeader.split(" ")[1];
  }
  if (jwtToken === undefined) {
    response.status(401);
    response.send("Invalid JWT Token");
  } else {
    jwt.verify(jwtToken, "MY_SECRET_TOKEN", async (error, payload) => {
      if (error) {
        response.status(401);
        response.send("Invalid JWT Token");
      } else {
        request.username = payload.username;
        request.userId = payload.userId;
        next();
      }
    });
  }
};

const tweetAccessVerification = async (request, response, next) => {
  const { userId } = request;
  const { tweetId } = request.params;
  const getTweetQuery = `select * from tweet INNER JOIN follower ON tweet.user_id=follower.following_user_id
    where
    tweet.tweet_id='${tweetId}' AND follower_user_id='${userId}';`;
  const tweet = await database.get(getTweetQuery);
  if (tweet === undefined) {
    response.status(401);
    response.send("Invalid Request");
  } else {
    next();
  }
};
//api-1

app.post("/register/", async (request, response) => {
  const { username, password, name, gender } = request.body;
  const getUserQuery = `select  * from user where username='${username}';`;
  const userDbDetails = await database.get(getUserQuery);
  if (userDbDetails !== undefined) {
    response.status(400);
    response.send("User already exits");
  } else {
    if (password.length < 6) {
      response.status(400);
      response.send("Password is too short");
    } else {
      const hashedPassword = await bcrypt.hash(password, 10);
      const createUserQuery = `insert into user(username,password,name,gender)
            values('${username}','${hashedPassword}','${name}','${gender}')`;
      await database.run(createUserQuery);
      response.send("User created successfully");
    }
  }
});

//api-2
app.post("/login/", async (request, response) => {
  const { username, password } = request.body;
  const selectUserQuery = `select * from user where username='${username}';`;
  const dbUser = await database.get(selectUserQuery);
  if (dbUser === undefined) {
    response.status(400);
    response.send("Invalid user");
  } else {
    const isPasswordMatched = await bcrypt.compare(password, dbUser.password);
    if (isPasswordMatched === true) {
      const payload = {
        username: username,
      };
      const jwtToken = jwt.sign(payload, "MY_SECRET_TOKEN");
      response.send({ jwtToken });
    } else {
      response.status(400);
      response.send("Invalid password");
    }
  }
});
//api-3
app.get("/user/tweets/feed/", authenticateToken, async (request, response) => {
  const { username } = request;
  const followingPeopleIds = await getFollowingPeopleIdsUser(username);
  const getTweetsQuery = `
    SELECT username,tweet,date_time as dateTime
    FROM user INNER JOIN tweet ON user.user_id=tweet.user_id
    WHERE
    user.user_id  IN(${followingPeopleIds})
    ORDER BY date_time DESC
    LIMIT 4;`;
  const tweets = await database.all(getTweetsQuery);
  response.send(tweets);
});
//api-4
app.get("/user/following/", authenticateToken, async (request, response) => {
  const { username, userID } = request;
  const getFollowingUsersQuery = `
    SELECT name FROM follower 
    INNER JOIN user ON user.user_id=follower.following_user_id
    WHERE follower_user_id='${userId}';`;
  const tweets = await database.all(getFollowingUsersQuery);
  response.send(tweets);
});
//api-5
app.get("/user/followers/", authenticateToken, async (request, response) => {
  const { username, userID } = request;
  const getFollowingUsersQuery = `
    SELECT DISTINCT name FROM follower 
    INNER JOIN user ON user.user_id=follower.following_user_id
    WHERE follower_user_id='${userId}';`;
  const tweets = await database.all(getFollowingUsersQuery);
  response.send(tweets);
});
//api-6
app.get(
  "/tweets/:tweetId",
  authenticateToken,
  tweetAccessVerification,
  async (request, response) => {
    const { username, userId } = request;
    const { tweetId } = request.params;
    const getTweetQuery = `SELECT tweet,
    (SELECT COUNT() FROM Like WHERE tweet_id= '${tweetId}') AS likes,
    (SELECT COUNT() FROM reply WHERE tweet_id='${tweetId}')AS replies,
    date_time As dateTime
    FROM tweet
    where tweet.tweet_id='${tweetId}';`;
    const tweet = await database.get(getTweetQuery);
    response.send(tweet);
  }
);
app.get(
  "/tweets/:tweetId/likes/",
  authenticateToken,
  tweetAccessVerification,
  async (request, response) => {
    const { tweetId } = request.params;
    const getLikesQuery = `
    SELECT username FROM user INNER JOIN like ON user.user_id=like.user_id
    WHERE tweet_id='${tweetId}';`;
    const likedUsers = await database.get(getLikesQuery);
    const usersArray = likedUsers.map((eachUser) => eachUser.username);
    response.send({ likes: usersArray });
  }
);
//api-8
app.get(
  "/tweets/:tweetId/replies/",
  authenticateToken,
  tweetAccessVerification,
  async (request, response) => {
    const { tweetId } = request.params;
    const getReplayQuery = `
    SELECT name,reply  FROM user INNER JOIN reply ON user.user_id=reply.user_id
    WHERE tweet_id='${tweetId}';`;
    const replyUsers = await database.all(getReplayQuery);
    response.send({ replies: repliedUsers });
  }
);
//api-9
app.get("/user/tweets/", authenticateToken, async (request, response) => {
  const { userId } = request;
  const getTweetQuery = `
    select tweet,
    COUNT(DISTINCT like_id) AS likes,
    COUNT(DISTINCT reply_id)AS replies
    date_time as dateTime
    FROM tweet LEFT JOIN reply ON tweet.tweet_id=reply.tweet_id LEFT JOIN ON tweet.tweet_id=like.tweet_id
    WHERE tweet.user_id='${userId}'
    GROUP BY tweet.tweet_id;`;
  const tweets = await database.all(getTweetQuery);
  response.send(tweets);
});
//api-10
app.post("/user/tweets/", authenticateToken, async (request, response) => {
  const { tweet } = request.body;
  const userId = parseInt(request.userId);
  const dateTime = new Date().toJSON().substring(0, 19).replace("T", " ");
  const createTweetQuery = `
    INSERT INTO tweet(tweet,user_id,date_time)
    VALUES ('${tweet}','${userId}','${dateTime}');`;
  await database.run(createTweetQuery);
  response.send("Created a Tweet");
});
//api-11
app.delete(
  "/tweets/:tweetId/",
  authenticateToken,
  async (request, response) => {
    const { tweetId } = request.params;
    const { userId } = request;
    const getTweet = `SELECT * FROM tweet WHERE user_id ='${userId}' AND tweet_id='${tweetId}';`;
    const tweet = await database.get(getTweet);
    if (tweet === undefined) {
      response.status(401);
      response.send("Invalid Request");
    } else {
      const deleteTweet = `DELETE FROM tweet WHERE tweet_id='${tweetId}';`;
      await database.run(deleteTweet);
      response.send("Tweet Removed");
    }
  }
);

module.exports = app;
