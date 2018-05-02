Introduction
============

Node.js allows Javascript, typically a browser side language to be used on the 
server.  There is a primary program **node** which runs as a web server and
processes server side Javascript.  This article describes it pretty well:
https://en.wikipedia.org/wiki/Node.js

The web server, the **node** program provides is very lightweight and not 
terribly powerful.  What it's really missing is high speed service for static 
images.  What it does really well is run Javascript applications, specifically 
designed for it.

So the goal of this project is to allow people to write Node.js applications,
or use existing, very powerful Node.js applications (Ghost is one I tested with)
directly on Litespeed Enterprise.  The goal is that those applications must not
require even a tiny bit of modification.  They must run "as is".

Javascript Under Node.js
========================

This is the simplest application I could find:
```
#!/usr/bin/env node
var http = require('http');

http.createServer(function(req, res) {
    res.writeHead(200, { 'Content-Type': 'text/plain'});
    res.end("Hello World!");
}).listen(9000);
```

All that this program does is listen on port 9000 and respond to all requests
on it with `Hello World!`

Because of the magic number in line 1: `#!/usr/bin/env node` this can be 
executed stand-alone on a system with the `node` program installed, or run as
a command line parameter to the `node` program which knows to ignore magic 
numbers.  You can bring up your browser, navigate to `http://127.0.0.1:9000`
and you will be presented with the text `Hello World!`.

The goal of this project is to be able to run programs as simple as this or
as complex as they can be, without modification within Litespeed Enterprise.

How it Works (Basic)
====================

We have written a basic Node.js module, named `lsnode.js` (installed by default
in $SERVER_ROOT/fcgi-bin) which is run as a program by Litespeed Enterprise.

For now this will not work with OpenLitespeed.

There is a sample httpd_config.xml configuration file included which was my 
config file for testing.  It was configured to run the Ghost program described 
at `https://ghost.org/`.  To install it an run it as a local user, I went to a 
directory where the Litespeed user would have rights and did a git clone of the 
distribution:
```
git clone https://github.com/TryGhost/Ghost.git
```

From the highest level Ghost directory I wrote a simple script named `StartGhost`
```
#!/usr/bin/env node
require('./index.js');
```

Change the permissions to make the script executable: `chmod 700 StartGhost`

Set up Litespeed Enterprise to run the script (described below).

Testing can be done with a complex application like Ghost or just create the 
sample above or anything else you'd like to test that runs Node.js natively.

The configuration starts a program, which communicates with Litespeed through
a UNIX domain socket, and runs as long as Litespeed does.  Litespeed listens
on the port and passes all communications through to the node program which
processes it as if it was communicating with the client directly.

Note that the port specified in the `listen` command of the Javascript 
application will be ignored.  The port specified in the Litespeed configuration 
will be used.

Configuring Litespeed
---------------------

There are four primary steps in Litespeed Configuration:
   - Configure a **LSAPI Application** at the server level to process the request.
   - Configure a **Web Server** at the server level to pass requests to the app.
   - Configure a **Listener** to accept and forward the requests.
   - Configure the **Virtual Host** to specify the path to be serviced.

All steps are performed in the Litespeed Configuration panels, often 
accessed at `https://127.0.0.1:7080`  You will need to have Litespeed installed
and administrative access to the server.


Configuring the LSAPI Application
---------------------------------

In the Litespeed Configuration panels, press the **Server** tab, the 
**External App** tab and press the **Add** button in the header.

From the pull down, select **LSAPI App** and press the **Next** button.

The following fields will need to be entered, the remaining can be left at 
defaults:
- Name: Enter any memorable name, but a common one is `lsnode_start`
- Address: Enter a UDS file name in a directory that the Litespeed user has 
  access to and is appropriate. It must be in the format `uds://directories/file`
  An example would be `uds://tmp/lshttpd/lsnode1.sock`  The older configuration
  requires that this field be http or https.  If the configuration can't be saved
  and an error displayed, enter a temporary value with an http prefix and later 
  edit the httpd_config.xml file and update the *address* configuration value 
  manually.  The correct value will be displayed the next time the screen is
  updated.
- Max Connections:  Enter any non-zero number which would be appropriate for the
  maximum number of connections.  The sample uses **35**.
- Environment: There are three environment variables that need to be set to run
  your node script (environment variables are entered as property=value on 
  separate lines in the Environment edit field):
    - LSNODE_ROOT: The default directory for your application.  In the example:
      `LSNODE_ROOT=/home/user/proj/Ghost/`
    - LSNODE_STARTUP_FILE:  The script to run.  In the example: 
      `LSNODE_STARTUP_FILE=StartGhost`
    - LSAPI_CHILDREN: Needs to be set to the same value as Max Connections above.
      In the example: `LSAPI_CHILDREN=35`
- Initial Request Timeout (secs): In the sample it's **60**
- Retry Timeout (secs): In the sample it's **0**
- Persistent Connection: Must be specified as **Yes**.  You can skip the next 
  few options.
- Auto Start: Must be specified as **Through CGI Daemon (Async)**
- Command: The Litespeed Node.js script file.  Almost always: 
  **$SERVER_ROOT/fcgi-bin/lsnode.js**
- Back Log: The sample uses **100**
- Instances: Must be set to **1**. There can't be more or less.  You can skip 
  the next few options.
- Run On Start Up:  Must be set to **Yes**

The remaining fields can be left at defaults.  Press the **Save** button.

Configuring the Web Server
--------------------------

In the Litespeed Configuration panels, press the **External** tab, the 
**External App** tab and press the **Add** button in the header.

From the pull down, select **Web Server** and press the **Next** button.

The following fields will need to be entered, the remaining can be left at 
defaults:

- Name: Specify some memorable name.  The sample uses `ghost`.
- Address:  Enter a UDS file name in a directory that the Litespeed user has 
  access to and is appropriate. It must be in the format `uds://directories/file`
  and it must match the value specified in the *LSAPI Application*.
  An example would be `uds://tmp/lshttpd/lsnode1.sock`
- Max Connections: The sample uses **10**
- Connection Keepalive Timeout: The sample uses **60**
- Environment: Need not be set.
- Initial Request Timeout (secs): The sample uses **60**
- Retry Timeout (secs): The sample uses **0**
- Response Buffering: Select **No**

Press the **Save** button to save your definition.

Configuring the Listener
------------------------

In the Litespeed Configuration panels, press the **Listeners** tab and either
select the *Default* listener or press the *Add* button to add a new listener.
For the Listener definition, it is the *Port* that is most significant parameter.

Security and other important options can be specified here.  Save your 
modifications when you are satisfied.  The sample uses port 8088.

Configuring the Virtual Host
----------------------------

In the Litespeed Configuration panels, press the **Virtual Hosts** tab and press
the **Context** tab.  Here you are specifying the directory level on the server
where the application will appear.  It's often the root level (/).  If there's 
already a definition at the level you wish to use, and it's not correct, delete
it.

Press the **Add** button and select the **Proxy** option. Press the **Next**
button.

The fields to be specified:
- URI:  The sample uses the root: **/**
- Web Server: Select the server level web server. For the sample it's *ghost*

All other fields can be left at their defaults. Press the **Save** button to 
save your definition.

Press the **General** tab and press the **Edit** button.  The only field to be
edited is:
- Document Root: Most users will enter: **$VH_ROOT/html**  You may need to create
  this directory manually.  In the example the *Virtual Host Root* which can be 
  displayed in the *Basic* tab is $SERVER_ROOT/DEFAULT.  Thus you may need to 
  go into this directory and manually create the **html** subdirectory.  This 
  is rarely necessary with the initial virtual host, but may be necessary for
  subsequent ones.

You complete your configuration by performing a *Graceful Restart* of the server.


Running Different Node Versions
===============================

If you have a need to run multiple versions of the node program because you are
serving multiple, separate applications you may already be familiar with the
facility NVM (Node Version Manager): https://github.com/creationix/nvm

NVM does its magic by modifying bash and that may be a bit problematic when
attempting to start scripts using the shebang (hashbang) of `#!/usr/bin/env node`
as this does not allow the bash control necessary to run NVM.

Thus a prequel script: `nvm_lsnode.bash` is provided which will:
   - Properly source the NVM environment.  The required environment variable 
     `NVM_DIR` must be specified in the *External App*, *Environment* definition.
   - Using the required environment variable `LSNODE_NVM_VERSION`, again
     specified in the *External App*, *Environment* definition, run the
     NVM to setup for executing the specified version of node.
   - Run the `lsnode.js` script to execute the process specified above.

As a prerequisite to using this script, you must install NVM and using NVM
install the version of node you wish to use. Once the prerequites are done,
Litespeed can be configured as described below.


Configuration for a Different Script and Node Version
-----------------------------------------------------

The need for a separate node version implies a separate script, and usually
a separate listening port.  Configuration is quite similar to that described
above.

Notes
=====

As with most issues in Litespeed the starting point to look for any problems
is in the error.log in the $SERVER_ROOT/logs directory.  Also note that any 
problems in subtasks may be written to stderr.log in that same directory.

When the server starts it will create a separate process specifically for 
processing Node.js requests. In the process list it is named 
*Litespeed Node.js Service*. 

When you stop the Litespeed server, this process will remain and another one
will be started when the server is started.  This may make both inoperative, so
at this time, you will need to manually kill this process before restarting the
server.


Contact
=======

For support questions, please post to our free support forum, at:

https://www.litespeedtech.com/support/forum/

For bug report, please send bug report to bug [at] litespeedtech.com.




