# debate-discord-bot

A Discord bot to greet users and add them to tournament servers.

## What's this for?

Many debate tournaments are using Discord as an online platform due to COVID. The standard setup is one "hub" server and multiple competition servers -- each competition server can generally host 5 competition rooms in a two-person debate format. For larger tournaments, it can be tedious for tournament attendees to join and correctly set their nickname and role on each server.

This bot greets new users who join the tournament hub and asks for their nickname and role. It then asks the user for permission to join servers on their behalf. Once granted, it adds the user to each tournament server and sets their nickname/role.

# Setup

1. Deploy the app to a hosting service such as Heroku.

2. Create a new Discord application [here](https://discord.com/developers/applications).

3. Navigate to the "Bot" tab and create a bot for your application.

4. Grab your client ID from the "General Information" tab and navigate to this URL: https://discord.com/oauth2/authorize?client_id=YOUR_CLIENT_ID&scope=bot&permissions=8, replacing YOUR_CLIENT_ID with your client ID. Add the bot to each server for the tournament.

5. Click to the "OAuth2" tab and add a new redirect URL. It should be the URL your bot lives at plus `/callback` -- e.g. `https://your-bot.herokuapp.com/callback`

6. Set the following environment variables on Heroku (or wherever you're running the bot):

* `CLIENT_ID` - from the Discord app "General Information" page
* `CLIENT_SECRET` - from the Discord app "General Information" page
* `REDIRECT_URI` - from step 5 above
* `BOT_TOKEN` - from the Discord app "Bot" page
* `HUB_SERVER_NAME` - the name of your hub server
* `TOURNAMENT_NAME` - the name of your tournament (used when greeting new users)
* `TOURNAMENT_ROLES` - a comma-separated list of role names; these roles must be configured on each of your tournament servers. For example: `judge,competitor,spectator`

7. Generate a permanent invite for your hub server and send it out to your tournament attendees.

# License

MIT
