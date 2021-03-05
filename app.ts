import Discord, { DMChannel, Guild, Message } from "discord.js";
import dotenv from "dotenv";
import fetch from "node-fetch";
import fs from "fs";
import http from "http";
import url from "url";

dotenv.config();

const {
  CLIENT_ID,
  CLIENT_SECRET,
  REDIRECT_URI,
  BOT_TOKEN,
  HUB_SERVER_NAME,
  TOURNAMENT_NAME,
  TOURNAMENT_ROLES,
} = process.env;

if (
  !(
    CLIENT_ID &&
    CLIENT_SECRET &&
    REDIRECT_URI &&
    BOT_TOKEN &&
    HUB_SERVER_NAME &&
    TOURNAMENT_NAME &&
    TOURNAMENT_ROLES
  )
) {
  throw new Error(
    "CLIENT_ID, CLIENT_SECRET, REDIRECT_URI, BOT_TOKEN, HUB_SERVER_NAME, TOURNAMENT_NAME, and TOURNAMENT_ROLES must be set in environment or .env file"
  );
}

const ROLES = TOURNAMENT_ROLES.split(",");

//
// Discord bot.
//
const getReply = async (
  channel: DMChannel,
  memberId: string,
  prompt: string,
  options: null | Array<string> = null,
  isFirstAttempt: boolean = true
): Promise<string> => {
  let optionsList: string;
  let promptMessage = "";
  if (!isFirstAttempt) {
    promptMessage += "Sorry, I didn't understand your response. ";
  }
  promptMessage += prompt;
  if (options) {
    optionsList = options.map((option) => `'${option}'`).join(", ");
    promptMessage += `  Please reply with one of ${optionsList}.`;
  }
  await channel.send(promptMessage);

  const filter = (message: Message) => memberId === message.author.id;
  const messages = await channel.awaitMessages(filter, {
    max: 1,
    time: 1000000000,
  });

  const message = messages.first();
  if (message && !options) {
    return message.content;
  } else if (
    message &&
    options &&
    options.includes(message.content.toLowerCase())
  ) {
    return message.content.toLowerCase();
  } else {
    return getReply(channel, memberId, prompt, options, false);
  }
};

const client = new Discord.Client();

let mainGuild: Guild;
let otherGuilds: Array<Guild>;

client.on("ready", () => {
  console.log("Bot is ready!");
  const foundMainGuild = client.guilds.cache.find(
    (guild) => guild.name === HUB_SERVER_NAME
  );
  if (foundMainGuild) {
    mainGuild = foundMainGuild;
    console.log(`Found main server: ${HUB_SERVER_NAME}`);
  } else {
    throw new Error(`Could not find main server with name ${HUB_SERVER_NAME}`);
  }

  otherGuilds = client.guilds.cache
    .filter((guild) => guild.name !== HUB_SERVER_NAME)
    .map((guild) => guild);
  console.log(
    `Found other servers: ${otherGuilds.map((guild) => guild.name).join(", ")}`
  );
});

// Create an event listener for new guild members.
client.on("guildMemberAdd", async (member) => {
  console.log(`New member joined: ${member.user.username}`);
  if (member.guild.id !== mainGuild.id) {
    console.log("Returning because this is not the hub server");
    return;
  }

  const channel = await member.createDM();

  await channel.send(`Welcome to the ${TOURNAMENT_NAME} tournament hub!`);

  const nickname = await getReply(
    channel,
    member.id,
    "What is your name? (Please use something that members of the community can recognize you by.)"
  );
  member.setNickname(nickname);

  await channel.send(
    `Thanks ${nickname}! I've set your nickname in the server for you.`
  );
  const roleName = await getReply(
    channel,
    member.id,
    "What is your role at the tournament?",
    ROLES
  );
  const role = member.guild.roles.cache.find((role) => role.name === roleName);
  if (!role) {
    console.log(`Could not find role ${roleName} on hub`);
    return;
  }
  member.roles.add(role);

  await channel.send(
    "Thanks! You now have access to the rest of the tournament hub. I am about to automatically add you to the other tournament servers -- please click the following link and grant me permission to add you to servers when prompted."
  );
  await channel.send(
    `https://discord.com/api/oauth2/authorize?client_id=${CLIENT_ID}&redirect_uri=${REDIRECT_URI}&response_type=code&scope=guilds.join%20identify`
  );
});

// Log our bot in.
client.login(BOT_TOKEN);

//
// HTTP server for OAuth2 callback.
//
const port = process.env.PORT || 5000;

const addUserToServers = async (code: string) => {
  // Fetch the token from Discord using the grant code.
  const data = {
    client_id: CLIENT_ID,
    client_secret: CLIENT_SECRET,
    grant_type: "authorization_code",
    redirect_uri: REDIRECT_URI,
    scope: "identify,guilds.join",
    code,
  };
  const tokenResponse = await fetch("https://discord.com/api/oauth2/token", {
    method: "POST",
    body: new URLSearchParams(data).toString(),
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
    },
  }).then((response) => response.json());
  const token = tokenResponse.access_token as string;

  // Fetch the user who authenticated.
  const userResponse = await fetch("https://discord.com/api/oauth2/@me", {
    method: "GET",
    headers: {
      Authorization: `Bearer ${token}`,
    },
  }).then((response) => response.json());
  const userId = userResponse.user.id as string;

  // Fetch the user's member on the hub server.
  const mainMember = await mainGuild.members.fetch(userId);
  if (!mainMember) {
    console.log(
      "User is not a member of the main guild; this should not happen as they joined the guild to initiate the process"
    );
    return false;
  }

  // Fetch the role that the bot automatically granted.
  const role = mainMember.roles.cache.find((role) => ROLES.includes(role.name));
  if (!role) {
    console.log(
      "User in main guild has no roles; this should not happen as the bot should have previously granted the role"
    );
    return false;
  }

  // Add the user to each tournament server.
  otherGuilds.forEach((otherGuild) => {
    const roleName = role.name;
    const otherGuildMatchingRole = otherGuild.roles.cache.find(
      (role) => role.name === roleName
    );
    if (otherGuildMatchingRole) {
      otherGuild.addMember(mainMember.user, {
        nick: mainMember.nickname || undefined,
        accessToken: token,
        roles: [otherGuildMatchingRole],
      });
      console.log(`Added user to ${otherGuild.name} with role ${roleName}`);
    } else {
      console.log(
        `Could not find matching role with name '${roleName}' in ${otherGuild.name}`
      );
      return false;
    }
  });

  return true;
};

const server = http.createServer();

server.on("request", async (req, res) => {
  if (req.url && req.url.startsWith("/callback")) {
    const queryObject = url.parse(req.url, true).query;
    const code = queryObject.code as string;

    const success = await addUserToServers(code);

    res.writeHead(200, {
      "content-type": "text/html;charset=utf-8",
    });
    if (success) {
      res.write(
        "Thanks! Please close the browser window and return to Discord; you have now been added to the tournament servers."
      );
    } else {
      res.write(
        "Something went wrong! Please contact the tournament staff for assistance."
      );
    }
    res.end();
  } else {
    res.writeHead(404);
    res.end();
  }
});

server.listen(port);
