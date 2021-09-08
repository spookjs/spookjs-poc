# Spook.js
This is a proof of concept for **spook.js**. It launches a webserver that will serve on http://localhost:8080 by default. The proof of concept was tested with Chrome 89 using Intel i7-6700K and i7-7600U processors.

## Running
The code uses node.js to run the webserver. We assume your system has node.js and npm installed. Run the following commands in this directory to start the server:
```
$ npm install
$ node ./server.js
```

## Third Party Code
Builds upon the following software:
- https://github.com/cgvwzq/evsets
- https://github.com/google/security-research-pocs

Third party code located in:
- static/js/leaky-page/
- static/js/evsets/