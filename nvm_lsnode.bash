#!/bin/bash
# This is a sample script that you can modify to use a specific version of node
# using the NVM facility.
# To make the sample more generic, we use an environment variable 
# LSNODE_NVM_VERSION to specify the version of node to run.
# It is assumed that this script is in the same directory as lsnode.js.
if [ ! -n "$NVM_DIR" ]; then
    echo >&2 "Required environment variable NVM_DIR not set"
    exit 127
fi
NVM_SCRIPT=${NVM_DIR}/nvm.sh
if [ ! -r $NVM_SCRIPT ]; then
    echo >&2 "NVM not installed in expected location ($NVM_SCRIPT)"
    exit 127
fi
if [ ! -n "$LSNODE_NVM_VERSION" ]; then
    echo >&2 "Required environment variable LSNODE_NVM_VERSION not set"
    exit 127
fi
PGM=$0
DIR=`dirname "$PGM"`
if [ ! -x "${DIR}/lsnode.js" ]; then
    echo >&2 "lsnode.js script not found at '${DIR}/lsnode.js'"
    exit 127
fi
>&2 . $NVM_SCRIPT
>&2 nvm use $LSNODE_NVM_VERSION
if [ $? -gt 0 ]; then
    echo >&2 "Error in NVM version switch"
    exit 127
fi
>&2 "${DIR}/lsnode.js"

