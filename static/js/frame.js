function log(msg) {
    window.parent.postMessage({type: 'log', message: msg});
}

async function startWorker() {
    log("Starting worker!");

    const workerThread = new Worker('js/frame-worker.js');

    workerThread.onmessage = async function handle(event) {
        let message = event.data;

        switch (message.type) {
            case 'log':
                log(message.message);
                break;

            // Recoverable errors
            case 'error':
                log(`ERROR: ${message.message}`);
                workerThread.terminate();
                location.reload();
                break;

            // Unrecoverable errors
            case 'exception':
                log(`ERROR: ${message.message}`);
                break;

            // Forward this message to Spook.js
            case 'array_ptr':
                log(`Forwarding array pointer to main window`);
                window.parent.postMessage(message);
                break;

            default:
                log("Unhandled message: " + JSON.stringify(message));
                break;
        }
    };
}

startWorker();
