FROM node:8

ENV HOST localhost
ENV PORT 3003

# Create app directory
RUN mkdir -p /usr/src/app
WORKDIR /usr/src/app

# Install GYP dependencies globally, will be used to code build other dependencies
RUN npm install -g --production node-gyp && \
    npm cache clean --force

# Install Gekko dependencies
COPY package.json .
RUN npm install --production && \
    npm install --production redis@0.10.0 talib@1.0.2 tulind@0.8.7 pg && \
    npm cache clean --force

# Install Gekko Broker dependencies
WORKDIR exchange
COPY exchange/package.json .
RUN npm install --production && \
    npm cache clean --force
WORKDIR ../

# Bundle app source
COPY . /usr/src/app

EXPOSE 3003
# RUN chmod +x /usr/src/app/docker-entrypoint.sh
# ENTRYPOINT ["/usr/src/app/docker-entrypoint.sh"]

CMD ["node", "runGekkoWithConfigFromENV.js"]
