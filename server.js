const express     = require('express');
const serveStatic = require('serve-static');
const yargs       = require('yargs');

const argv = yargs
    .option('port', {
        default: 8080,
        description: 'port to bind http server to',
    })
    .option('address', {
        default: '0.0.0.0',
        description: 'address to bind http server to',
    })
    .option('serve', {
        default: 'static',
        description: 'directory to serve over http',
    })
    .argv;

const port = argv.port;
const address = argv.address;


const app = express();

app.use(function(req, res, next){
    res.header("Cross-Origin-Embedder-Policy", "require-corp");
    res.header("Cross-Origin-Opener-Policy", "same-origin");
    next();
});

app.use(express.text({limit: '50mb'}));
app.use(express.json({limit: '50mb'}));
app.use(serveStatic(argv.serve));

app.listen(port, address, () => {
    console.log(`Listening on ${address}:${port}`);
});