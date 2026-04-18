- Add x10 small preview page on active videos, where user can press video to switch to full screen
-  Add option to name the session when adding video
- Streamserver mode redirects to wrong port ( 8088 ) scould be 3000 
- Active sessions window will have smal preview of video
- Vod sync twitch repo is broken, so we change vod sync featcher to be a popup redirected to the running webapp
- Mayby change the port to get vod sync working? 



ErrorLog for vod sync:

# when vod sync set to public dir/ 

   streamlink binary: streamlink
   VOD sync path:     /home/apex/greekapp-twitch-main/vod-sync-app/public/
   Public path:       /home/apex/greekapp-twitch-main/public

URIError: Failed to decode param '%PUBLIC_URL%/manifest.json'
    at decodeURIComponent (<anonymous>)
    at decode_param (/home/apex/greekapp-twitch-main/node_modules/express/lib/router/layer.js:172:12)
    at Layer.match (/home/apex/greekapp-twitch-main/node_modules/express/lib/router/layer.js:148:15)
    at matchLayer (/home/apex/greekapp-twitch-main/node_modules/express/lib/router/index.js:585:18)
    at next (/home/apex/greekapp-twitch-main/node_modules/express/lib/router/index.js:226:15)
    at SendStream.error (/home/apex/greekapp-twitch-main/node_modules/serve-static/index.js:121:7)
    at SendStream.emit (node:events:519:28)
    at SendStream.error (/home/apex/greekapp-twitch-main/node_modules/send/index.js:270:17)
    at SendStream.pipe (/home/apex/greekapp-twitch-main/node_modules/send/index.js:515:10)
    at serveStatic (/home/apex/greekapp-twitch-main/node_modules/serve-static/index.js:125:12)
URIError: Failed to decode param '%PUBLIC_URL%/favicon.ico'
    at decodeURIComponent (<anonymous>)
    at decode_param (/home/apex/greekapp-twitch-main/node_modules/express/lib/router/layer.js:172:12)
    at Layer.match (/home/apex/greekapp-twitch-main/node_modules/express/lib/router/layer.js:148:15)
    at matchLayer (/home/apex/greekapp-twitch-main/node_modules/express/lib/router/index.js:585:18)
    at next (/home/apex/greekapp-twitch-main/node_modules/express/lib/router/index.js:226:15)
    at SendStream.error (/home/apex/greekapp-twitch-main/node_modules/serve-static/index.js:121:7)
    at SendStream.emit (node:events:519:28)
    at SendStream.error (/home/apex/greekapp-twitch-main/node_modules/send/index.js:270:17)
    at SendStream.pipe (/home/apex/greekapp-twitch-main/node_modules/send/index.js:515:10)
    at serveStatic (/home/apex/greekapp-twitch-main/node_modules/serve-static/index.js:125:12)


# When set to main directory 

