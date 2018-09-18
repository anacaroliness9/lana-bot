/*-----------------------------------------------------------------------------
A simple Language Understanding (LUIS) bot for the Microsoft Bot Framework. 
-----------------------------------------------------------------------------*/

var restify = require('restify');
var builder = require('botbuilder');
var botbuilder_azure = require("botbuilder-azure");
const axios = require('axios');
// Setup Restify Server
var server = restify.createServer();
server.listen(process.env.port || process.env.PORT || 3978, function () {
   console.log('%s listening to %s', server.name, server.url); 
});
  
// Create chat connector for communicating with the Bot Framework Service
var connector = new builder.ChatConnector({
    appId: process.env.MicrosoftAppId,
    appPassword: process.env.MicrosoftAppPassword,
    openIdMetadata: process.env.BotOpenIdMetadata 
});

// Listen for messages from users 
server.post('/api/messages', connector.listen());

/*----------------------------------------------------------------------------------------
* Bot Storage: This is a great spot to register the private state storage for your bot. 
* We provide adapters for Azure Table, CosmosDb, SQL Azure, or you can implement your own!
* For samples and documentation, see: https://github.com/Microsoft/BotBuilder-Azure
* ---------------------------------------------------------------------------------------- */

var tableName = 'botdata';
var azureTableClient = new botbuilder_azure.AzureTableClient(tableName, process.env['AzureWebJobsStorage']);
var tableStorage = new botbuilder_azure.AzureBotStorage({ gzipData: false }, azureTableClient);

// Create your bot with a function to receive messages from the user
// This default message handler is invoked if the user's utterance doesn't
// match any intents handled by other dialogs.
var bot = new builder.UniversalBot(connector, function (session, args) {
    session.send('You reached the default message handler. You said \'%s\'.', session.message.text);
});

bot.set('storage', tableStorage);

// Make sure you add code to validate these fields
var luisAppId = process.env.LuisAppId;
var luisAPIKey = process.env.LuisAPIKey;
var luisAPIHostName = process.env.LuisAPIHostName || 'westus.api.cognitive.microsoft.com';

const LuisModelUrl = 'https://' + luisAPIHostName + '/luis/v2.0/apps/' + luisAppId + '?subscription-key=' + luisAPIKey;

// Create a recognizer that gets intents from LUIS, and add it to the bot
var recognizer = new builder.LuisRecognizer(LuisModelUrl);
bot.recognizer(recognizer);

// Add a dialog for each intent that the LUIS app recognizes.
// See https://docs.microsoft.com/en-us/bot-framework/nodejs/bot-builder-nodejs-recognize-intent-luis 

bot.dialog('GreetingDialog',
    (session) => {
        session.send('Olá, eu sou a Lana, sua assistente de criação de demos.');
        session.beginDialog('ListaDemos');
        session.endDialog();
    }
).triggerAction({
    matches: 'Greeting'
});

bot.dialog('HelpDialog',
    (session) => {
        session.send('You reached the Help intent. You said \'%s\'.', session.message.text);
        session.endDialog();
    }
).triggerAction({
    matches: 'Help'
});

bot.dialog('CancelDialog',
    (session) => {
        session.send('Até logo. =]');
        session.endDialog();
    }
).triggerAction({
    matches: 'Cancel'
});

bot.dialog('ListaDemos', [
    (session) => {
        var options=["DNS","DHCP","Outras"];
        builder.Prompts.choice(session, "As demos diponíveis são:", options, { listStyle: builder.ListStyle.button });
        session.endDialog();
    }
]).triggerAction({
    matches: 'ListDemos'
});

bot.dialog('iniciarDNS',[
    (session) => {
        builder.Prompts.choice(session, "Deseja abrir um chamado para disponilibizar um serviço de DNS?", "Sim|Não",  { listStyle: builder.ListStyle.button });
    },
    (session, results) => {
        if (results.response) {
            if (results.response.entity=='Não'){
                session.beginDialog('CancelDialog');
            } else {
                session.conversationData.demo = "DNS";
                var dns_size= {
                    "Pequeno": {
                        code: "P",
                        users: 1000,
                        desc: "Pequeno: até 1000 usuários"
                    },
                    "Medio": {
                        code: "M",
                        users: 2000,
                        desc: "Médio: até 2000 usuários"
                    },
                    "Outras": {
                        code: "G",
                        users: 5000,
                        desc: "Outras: até 5000 usuários"
                    }};
                builder.Prompts.choice(session, "Qual  tamanho do ambiente?", dns_size,  { listStyle: builder.ListStyle.button });
            }
        } else {
            session.beginDialog('CancelDialog');
        }
    },
    (session, results) => {
        if (results.response) {
            session.conversationData.demoSize = results.response.entity;
            session.beginDialog('demoDurationDialog');
        } else {
            session.beginDialog('CancelDialog');
        }
    }
]).triggerAction({
    matches: 'DNS.create'
});


bot.dialog('demoDurationDialog', [
    (session) => {
        //session.send('As demos diponíveis são:');
        var options=["1","7","15"];
        builder.Prompts.choice(session, "Quantos dias você vai usar o ambiente?", options, { listStyle: builder.ListStyle.button });
    }, 
     (session, results) => {
        if (results.response) {
            session.conversationData.duration = results.response.entity;
            session.beginDialog('pepDialog');
        } else {
            session.beginDialog('CancelDialog');
            session.endDialog();
        }
    }
]).triggerAction({
    matches: 'DEMO.duration'
});


bot.dialog('pepDialog', [
    (session) => {
         builder.Prompts.text(session, "Qual seu Centro de Custo?");
    },
    (session, results) => {
        if (results.response) {
            session.conversationData.demoPEP = results.response;
            session.beginDialog('emailDialog');
            //session.userData.duration = results.response.entity;
            //session.send('Demo: %s\n Tempo: %s dias', session.userData.demo, session.userData.duration);
        } else {
            session.beginDialog('CancelDialog');
            session.endDialog();
        }
    }
]).triggerAction({
    matches: 'DEMO.pep'
});


bot.dialog('emailDialog', [
    (session) => {
         builder.Prompts.text(session, "Qual seu e-mail?");
    },
    (session, results) => {
        if (results.response) {
            session.conversationData.demoEmail = results.response;
            session.beginDialog('revisaDialog');
        } else {
            session.beginDialog('CancelDialog');
            session.endDialog();
        }
    }
]).triggerAction({
    matches: 'DEMO.email'
});

bot.dialog('revisaDialog', [
    (session) => {
        session.send('Detalhes do chamado:\n\tTipo de demo:\t%s\n\tTempo de uso:\t%s dias\nE-mail:\t%s\n\tCentro de Custo:\t%s', 
            session.conversationData.demo, session.conversationData.duration, session.conversationData.demoEmail, session.conversationData.demoPEP);
        builder.Prompts.choice(session, "Confirma?", "Sim|Não", { listStyle: builder.ListStyle.button });
        //session.send('Até logo. =]');
        //session.endDialog();
    },
    (session, results) => {
         if (results.response.entity=='Não'){
            session.beginDialog('CancelDialog');
         } else {
            session.send('Chamado Aberto. =]'); // Comentar essa quando o dynamics estiver funcionando
            
            // AQUI FAZ A CHAMADA PARA O SERVICENOW
            axios.post('https://cb-sn.azurewebsites.net/send-configuration-request', {
                type : session.conversationData.demo,
                size: session.conversationData.demoSize,
                period: session.conversationData.duration,
                costCenter: session.conversationData.demoPEP,
                email : session.conversationData.demoEmail
            })
            .then(function (response) {
                console.log(response);
                // if (response === 'failure') {
                //     session.send('Desculpe, estamos passando por uma indisponibilidade no momento. Poderia tentar novamente em alguns minutos?');
                // } else {
                //     session.send('Chamado Aberto. =]');
                // }
            })
            .catch(function (error) {
                console.log(error);
            });
            session.endDialog();
         }
    }
]).triggerAction({
    matches: 'DEMO.revisa'
});
