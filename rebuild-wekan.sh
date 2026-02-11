#!/bin/bash

echo "Recommended for development: Newest Debian or Ubuntu amd64 based distro, directly to SSD disk or dual boot, not VM. Works fast."
echo "Note1: If you use other locale than en_US.UTF-8 , you need to additionally install en_US.UTF-8"
echo "       with 'sudo dpkg-reconfigure locales' , so that MongoDB works correctly."
echo "       You can still use any other locale as your main locale."
echo "Note2: Console output is also logged to ../wekan-log.txt"

function pause() {
  read -p "$*"
}

echo
PS3='Please enter your choice: '
options=("Install Wekan dependencies" "Build Wekan" "Run Meteor for dev on http://localhost:4000" "Run Meteor for dev on http://localhost:4000 with trace warnings, and warnings using old Meteor API that will not exist in Meteor 3.0" "Run Meteor for dev on http://localhost:4000 with bundle visualizer" "Run Meteor for dev on http://CURRENT-IP-ADDRESS:4000" "Run Meteor for dev on http://CURRENT-IP-ADDRESS:4000 with MONGO_URL=mongodb://127.0.0.1:27019/wekan" "Run Meteor for dev on http://CUSTOM-IP-ADDRESS:PORT" "Run tests" "Save Meteor dependency chain to ../meteor-deps.txt" "Quit")

if [[ "$OSTYPE" == "linux-gnu" ]]; then
  # Same idea as a venv; node/npm binaries and packages
  # are contained in this folder; as it depends on node version,
  # multiple versions can be tested altogether
  NODE_VERSION="14.21.4"
  DIR_NODE="$HOME/.local/wekan"
  NODE_URL="https://github.com/wekan/node-v14-esm/releases/download/v${NODE_VERSION}/node-v${NODE_VERSION}-linux-x64.tar.gz"

  # Add node and npm to the PATH so the commands are available (only for current script)
  export NODE_PATH="$DIR_NODE/v$NODE_VERSION/lib/node_modules"
  export PATH="$DIR_NODE/v$NODE_VERSION/bin:$PATH"
fi

select opt in "${options[@]}"; do
  case $opt in
  "Install Wekan dependencies")

    if [[ "$OSTYPE" == "linux-gnu" ]]; then
      echo "Linux"
      # Credits to: https://unix.stackexchange.com/questions/46081/identifying-the-system-package-manager
      declare -A os_info=(
        ['/etc/redhat-release']='yum'
        ['/etc/arch-release']='pacman'
        ['/etc/gentoo-release']='emerge'
        ['/etc/SuSE-release']='zypp'
        ['/etc/debian_version']='apt-get'
        ['/etc/alpine-release']='apk'
      )
      for f in ${!os_info[@]}; do
        if [[ -f ${f} ]]; then
          pmgr=${os_info[$f]}
          echo Base package manager: ${pmgr}

          case ${pmgr} in
          'apt-get')
            sudo apt-get install -y build-essential gcc g++ make git curl wget p7zip-full zip unzip unp p7zip-full
            ;;
          'pacman')
            pmgr='sudo pacman'
            if command -v yay &>/dev/null; then
              # escalate privileges itself if needed, preferable in a script
              pmgr=yay
              echo "using yay."
            fi
            ${pmgr} -S --needed gcc make git curl wget 7zip zip unzip
            ;;
          *)
            echo "${pmgr} not configured; you may contribute to the script!"
            echo "installation will continue as you may already have requirements."
            ;;
          esac
        fi
      done
      [ ! -d ${DIR_NODE} ] && mkdir -p ${DIR_NODE}

      # Download and install Node.js using wget
      wget -qO- "$NODE_URL" | tar -xz -C "$DIR_NODE"/ && mv "$DIR_NODE"/node-v${NODE_VERSION}-linux-x64 "$DIR_NODE"/v$NODE_VERSION

      # Add node and npm to the PATH so the commands are available (only for current script)
      npm -g uninstall node-pre-gyp
      # Latest fibers for Meteor sudo mkdir -p /usr/local/lib/node_modules/fibers/.node-gyp sudo npm -g install fibers
      npm -g install @mapbox/node-pre-gyp
      # Install Meteor, if it's not yet installed
      npm -g install meteor@2.16 --unsafe-perm
      #sudo chown -R $(id -u):$(id -g) $HOME/.npm $HOME/.meteor

      echo "the versions below should be the ones Wekan needs:"
      # Confirm the installation
      node -v
      npm -v

      node_help="NODE_PATH=$DIR_NODE/v$NODE_VERSION/lib/node_modules"
      path_help="PATH=$DIR_NODE/v$NODE_VERSION/bin:\$PATH"
      echo "Use the following environment variables if you want to manipulate node/npm manually"
      echo $node_help
      echo $path_help

    elif [[ "$OSTYPE" == "darwin"* ]]; then
      echo "macOS"
      softwareupdate --install-rosetta --agree-to-license
      brew install npm
      # Install n for home directory version of Node.js 14.21.4
      npm -g install n
      directory_name="~/.n"
      if [ ! -d "$directory_name" ]; then
        mkdir "$directory_name"
        echo "Directory '$directory_name' created."
      else
        echo "Directory '$directory_name' already exists."
      fi
      directory_name="~/.npm"
      if [ ! -d "$directory_name" ]; then
        mkdir "$directory_name"
        echo "Directory '$directory_name' created."
      else
        echo "Directory '$directory_name' already exists."
      fi
      if awk '/node-v14-esm/{found=1; exit} END{exit !found}' ~/.zshrc; then
        echo "The text node-v14-esm alread exists in .zshrc"
      else
        echo "The text node-v14-esm does not exist in .zshrc, adding for install node v14"
        echo "export N_NODE_MIRROR=https://github.com/wekan/node-v14-esm/releases/download" >>~/.zshrc
        export N_NODE_MIRROR="https://github.com/wekan/node-v14-esm/releases/download"
      fi
      if awk '/export N_PREFIX/{found=1; exit} END{exit !found}' ~/.zshrc; then
        echo "The text export N_PREFIX for local ~/.n directory already exists in .zshrc"
      else
        # echo "The text export N_PREFIX for local ~/.n directory does not exist in .zshrc, adding."
        echo "export N_PREFIX=~/.n" >>~/.zshrc
        export N_PREFIX=~/.n
      fi
      npm config set prefix '~/.npm'
      npm -g install npm@latest
      n 14.21.4
      npm -g uninstall node-pre-gyp
      npm -g install @mapbox/node-pre-gyp
      npm -g install node-gyp
      npm -g install meteor@2.16
      export PATH=~/.meteor:$PATH
      exit
    elif [[ "$OSTYPE" == "cygwin" ]]; then
      # POSIX compatibility layer and Linux environment emulation for Windows
      echo "TODO: Add Cygwin"
      exit
    elif [[ "$OSTYPE" == "msys" ]]; then
      # Lightweight shell and GNU utilities compiled for Windows (part of MinGW)
      echo "TODO: Add msys on Windows"
      exit
    elif [[ "$OSTYPE" == "win32" ]]; then
      # I'm not sure this can happen.
      echo "TODO: Add Windows"
      exit
    elif [[ "$OSTYPE" == "freebsd"* ]]; then
      echo "TODO: Add FreeBSD"
      exit
    else
      echo "Unknown"
      echo ${OSTYPE}
      exit
    fi

    break
    ;;

  "Build Wekan")
    echo "Building Wekan."
    #if [[ "$OSTYPE" == "darwin"* ]]; then
    #	echo "sed at macOS";
    #	sed -i '' 's/api\.versionsFrom/\/\/api.versionsFrom/' ~/repos/wekan/packages/meteor-useraccounts-core/package.js
    #else
    #	echo "sed at ${OSTYPE}"
    #	sed -i 's/api\.versionsFrom/\/\/api.versionsFrom/' ~/repos/wekan/packages/meteor-useraccounts-core/package.js
    #fi
    #cd ..
    #sudo chown -R $(id -u):$(id -g) $HOME/.npm $HOME/.meteor
    rm -rf .build/bundle node_modules .meteor/local .build
    meteor npm install --production
    meteor build .build --directory --platforms=web.browser
    rm -rf .build/bundle/programs/web.browser.legacy
    (cd .build/bundle/programs/server && rm -rf node_modules && chmod u+w *.json && meteor npm install --production)
    #(cd .build/bundle/programs/server/node_modules/fibers && node build.js)
    (cd .build/bundle/programs/server && npm install fibers --save-dev)
    (cd .build/bundle/programs/server/npm/node_modules/meteor/accounts-password && meteor npm remove bcrypt && meteor npm install bcrypt --production)
    # Cleanup
    cd .build/bundle
    find . -type d -name '*-garbage*' | xargs rm -rf
    find . -name '*phantom*' | xargs rm -rf
    find . -name '.*.swp' | xargs rm -f
    find . -name '*.swp' | xargs rm -f
    cd ../..
    # Add fibers multi arch
    #cd .build/bundle/programs/server/node_modules/fibers/bin
    #curl https://releases.wekan.team/fibers-multi.7z -o fibers-multi.7z
    #7z x fibers-multi.7z
    #rm fibers-multi.7z
    #cd ../../../../../../..
    echo Done.
    break
    ;;

  "Run Meteor for dev on http://localhost:4000")
    #Not in use, could increase RAM usage: NODE_OPTIONS="--max_old_space_size=4096"
    #---------------------------------------------------------------------
    # Logging of terminal output to console and to ../wekan-log.txt at end of this line: 2>&1 | tee ../wekan-log.txt
    #WARN_WHEN_USING_OLD_API=true NODE_OPTIONS="--trace-warnings"
    WRITABLE_PATH=.. WITH_API=true RICHER_CARD_COMMENT_EDITOR=false ROOT_URL=http://localhost:4000 meteor run --exclude-archs web.browser.legacy,web.cordova --port 4000 2>&1 | tee ../wekan-log.txt
    #---------------------------------------------------------------------
    break
    ;;

  "Run Meteor for dev on http://localhost:4000 with trace warnings, and warnings using old Meteor API that will not exist in Meteor 3.0")
    #Not in use, could increase RAM usage: NODE_OPTIONS="--max_old_space_size=4096"
    #---------------------------------------------------------------------
    # Logging of terminal output to console and to ../wekan-log.txt at end of this line: 2>&1 | tee ../wekan-log.txt
    WARN_WHEN_USING_OLD_API=true NODE_OPTIONS="--trace-warnings" WRITABLE_PATH=.. WITH_API=true RICHER_CARD_COMMENT_EDITOR=false ROOT_URL=http://localhost:4000 meteor run --exclude-archs web.browser.legacy,web.cordova --port 4000 2>&1 | tee ../wekan-log.txt
    #---------------------------------------------------------------------
    break
    ;;

  "Run Meteor for dev on http://localhost:4000 with bundle visualizer")
    #Not in use, could increase RAM usage: NODE_OPTIONS="--max_old_space_size=4096"
    #---------------------------------------------------------------------
    #Logging of terminal output to console and to ../wekan-log.txt at end of this line: 2>&1 | tee ../wekan-log.txt
    #WARN_WHEN_USING_OLD_API=true NODE_OPTIONS="--trace-warnings"
    WRITABLE_PATH=.. WITH_API=true RICHER_CARD_COMMENT_EDITOR=false ROOT_URL=http://localhost:4000 meteor run --exclude-archs web.browser.legacy,web.cordova --port 4000 --extra-packages bundle-visualizer --production 2>&1 | tee ../wekan-log.txt
    #---------------------------------------------------------------------
    break
    ;;

  "Run Meteor for dev on http://CURRENT-IP-ADDRESS:4000")
    if [[ "$OSTYPE" == "darwin"* ]]; then
      IPADDRESS=$(ifconfig | grep broadcast | grep 'inet ' | cut -d: -f2 | awk '{ print $2}' | cut -d '/' -f 1 | grep '192.')
    else
      IPADDRESS=$(ip a | grep 'noprefixroute' | grep 'inet ' | cut -d: -f2 | awk '{ print $2}' | cut -d '/' -f 1 | grep '192.')
    fi
    echo "Your IP address is $IPADDRESS"
    #---------------------------------------------------------------------
    #Not in use, could increase RAM usage: NODE_OPTIONS="--max_old_space_size=4096"
    #---------------------------------------------------------------------
    #Logging of terminal output to console and to ../wekan-log.txt at end of this line: 2>&1 | tee ../wekan-log.txt
    #WARN_WHEN_USING_OLD_API=true NODE_OPTIONS="--trace-warnings"
    WRITABLE_PATH=.. WITH_API=true RICHER_CARD_COMMENT_EDITOR=false ROOT_URL=http://$IPADDRESS:4000 meteor run --exclude-archs web.browser.legacy,web.cordova --port 4000 2>&1 | tee ../wekan-log.txt
    #---------------------------------------------------------------------
    break
    ;;

  "Run Meteor for dev on http://CURRENT-IP-ADDRESS:4000 with MONGO_URL=mongodb://127.0.0.1:27019/wekan")
    if [[ "$OSTYPE" == "darwin"* ]]; then
      IPADDRESS=$(ifconfig | grep broadcast | grep 'inet ' | cut -d: -f2 | awk '{ print $2}' | cut -d '/' -f 1 | grep '192.')
    else
      IPADDRESS=$(ip a | grep 'noprefixroute' | grep 'inet ' | cut -d: -f2 | awk '{ print $2}' | cut -d '/' -f 1 | grep '192.')
    fi
    echo "Your IP address is $IPADDRESS"
    #---------------------------------------------------------------------
    #Not in use, could increase RAM usage: NODE_OPTIONS="--max_old_space_size=4096"
    #---------------------------------------------------------------------
    #Logging of terminal output to console and to ../wekan-log.txt at end of this line: 2>&1 | tee ../wekan-log.txt
    #WARN_WHEN_USING_OLD_API=true NODE_OPTIONS="--trace-warnings"
    MONGO_URL=mongodb://127.0.0.1:27019/wekan WRITABLE_PATH=.. WITH_API=true RICHER_CARD_COMMENT_EDITOR=false ROOT_URL=http://$IPADDRESS:4000 meteor run --exclude-archs web.browser.legacy,web.cordova --port 4000 2>&1 | tee ../wekan-log.txt
    #---------------------------------------------------------------------
    break
    ;;

  "Run Meteor for dev on http://CUSTOM-IP-ADDRESS:PORT")
    ip address
    echo "From above list, what is your IP address?"
    read IPADDRESS
    echo "On what port you would like to run Wekan?"
    read PORT
    echo "ROOT_URL=http://$IPADDRESS:$PORT"
    #---------------------------------------------------------------------
    #Not in use, could increase RAM usage: NODE_OPTIONS="--max_old_space_size=4096"
    #---------------------------------------------------------------------
    #Logging of terminal output to console and to ../wekan-log.txt at end of this line: 2>&1 | tee ../wekan-log.txt
    #WARN_WHEN_USING_OLD_API=true NODE_OPTIONS="--trace-warnings"
    WRITABLE_PATH=.. WITH_API=true RICHER_CARD_COMMENT_EDITOR=false ROOT_URL=http://$IPADDRESS:$PORT meteor run --exclude-archs web.browser.legacy,web.cordova --port $PORT 2>&1 | tee ../wekan-log.txt
    #---------------------------------------------------------------------
    break
    ;;

  "Save Meteor dependency chain to ../meteor-deps.txt")
    meteor list --tree >../meteor-deps.txt
    echo "Saved Meteor dependency chain to ../meteor-deps.txt"
    #---------------------------------------------------------------------
    break
    ;;

  "Run tests")
    echo "Running tests (import regression)."
    node tests/wekanCreator.import.test.js
    break
    ;;

  "Quit")
    break
    ;;
  *) echo invalid option ;;
  esac
done
