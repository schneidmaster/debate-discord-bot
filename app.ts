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
  MAIN_GUILD_NAME,
  TOURNAMENT_NAME,
} = process.env;

if (
  !(
    CLIENT_ID &&
    CLIENT_SECRET &&
    REDIRECT_URI &&
    BOT_TOKEN &&
    MAIN_GUILD_NAME &&
    TOURNAMENT_NAME
  )
) {
  throw new Error(
    "CLIENT_ID, CLIENT_SECRET, REDIRECT_URI, BOT_TOKEN, MAIN_GUILD_NAME, and TOURNAMENT_NAME must be set in environment or .env file"
  );
}

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
    (guild) => guild.name === MAIN_GUILD_NAME
  );
  if (foundMainGuild) {
    mainGuild = foundMainGuild;
  } else {
    throw new Error(`Could not find guild with name ${MAIN_GUILD_NAME}`);
  }

  otherGuilds = client.guilds.cache
    .filter((guild) => guild.name !== MAIN_GUILD_NAME)
    .map((guild) => guild);
});

// Create an event listener for new guild members
client.on("guildMemberAdd", async (member) => {
  if (member.guild.id !== mainGuild.id) {
    return;
  }

  const everyoneRole = member.guild.roles.cache.find(
    (role) => role.name === "@everyone"
  );

  if (!everyoneRole) {
    console.log("Could not find everyone role");
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
    ["judge", "competitor", "spectator"]
  );
  const role = member.guild.roles.cache.find((role) => role.name === roleName);
  if (!role) {
    console.log(`Could not find role ${roleName}`);
    return;
  }
  member.roles.add(role);

  await channel.send(
    "Thanks! You now have access to the rest of the tournament hub. I am about to automatically add you to the other tournament servers -- please click the link below and grant me permission to add you to servers when prompted."
  );
  await channel.send(
    `https://discord.com/api/oauth2/authorize?client_id=${CLIENT_ID}&redirect_uri=${REDIRECT_URI}&response_type=code&scope=guilds.join%20identify`
  );
});

// Log our bot in using the token from https://discord.com/developers/applications
client.login(BOT_TOKEN);

const port = 5000;

http
  .createServer((req, res) => {
    if (req.url && req.url.startsWith("/callback")) {
      const queryObject = url.parse(req.url, true).query;
      const code = queryObject.code as string;
      const data = {
        client_id: CLIENT_ID,
        client_secret: CLIENT_SECRET,
        grant_type: "authorization_code",
        redirect_uri: REDIRECT_URI,
        scope: "identify,guilds.join",
        code,
      };
      fetch("https://discord.com/api/oauth2/token", {
        method: "POST",
        body: new URLSearchParams(data).toString(),
        headers: {
          "Content-Type": "application/x-www-form-urlencoded",
        },
      })
        .then((response) => response.json())
        .then((response) => {
          const token = response.access_token as string;
          fetch("https://discord.com/api/oauth2/@me", {
            method: "GET",
            headers: {
              Authorization: `Bearer ${token}`,
            },
          })
            .then((response) => response.json())
            .then((response) => {
              const userId = response.user.id as string;
              if (mainGuild) {
                mainGuild.members.fetch(userId).then((mainMember) => {
                  if (mainMember) {
                    const role = mainMember.roles.cache.first();
                    if (role) {
                      otherGuilds.forEach((otherGuild) => {
                        const roleName = role.name;
                        const secondRole = otherGuild.roles.cache.find(
                          (role) => role.name === roleName
                        );
                        if (secondRole) {
                          otherGuild.addMember(mainMember.user, {
                            nick: mainMember.nickname || undefined,
                            accessToken: token,
                            roles: [secondRole],
                          });
                        } else {
                          console.log(
                            `Could not find matching role with name '${roleName}' in ${otherGuild.name}`
                          );
                        }
                      });
                    } else {
                      console.log(
                        "User in main guild has no roles; this should not happen as the bot should have previously granted the role"
                      );
                    }
                  } else {
                    console.log(
                      "User is not a member of the main guild; this should not happen as they joined the guild to initiate the process"
                    );
                  }
                });
              }
            });
        });

      res.writeHead(200, {
        "content-type": "text/html;charset=utf-8",
      });
      res.write("Thanks! Please close the browser window.");
      res.end();
    } else {
      res.writeHead(400);
      res.end();
    }
  })
  .listen(port);
