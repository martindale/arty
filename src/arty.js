var util = require('util');
var webrtc = require('./adapter');
//var Datastore = require('nedb');

function Arty(options) {
  if (!options) {
    options = {};
  }
  this.options = options;
  this.seeds = options.seeds || ['ws://localhost:20500'];
  this.peers = {};

  this._pendingDataChannels = {};
  this._dataChannels = {};

  this.iceServers = options.iceServers || [{url:'stun:stun.l.google.com:19302'}];
}

util.inherits(Arty, require('events').EventEmitter);

Arty.prototype.start = function() {
  var self = this;
  self.p = P.create();
  // TODO: multiple seed attempts
  self.onramp = self.p.connect(self.seeds[0]);
  self.onramp.on('message', self._addPeer);
  self.emit('start');
};

Arty.prototype._addPeer = function(peerAddress) {
  var self = this;
  // TODO: use hash.js to generate a real hash.
  var hash = peerAddress;
  self.peers[hash] = self.onramp.connect(peerAddress);
  self.peers[hash].on('message', self._route);
  self.emit('peer', self.peers[hash]);
};

Arty.prototype._errorHandler = function(err) {
  console.error(err);
};

Arty.prototype._makeDataChannel = function() {
  var self = this;
  var channel = self.pc.createDataChannel('fabric', { reliable: true });
  channel.onopen = function() {
    console.log('Channel connected!');
  };
  channel.onmessage = function(e) {
    try {
      var data = JSON.parse(e.data);
      console.log('incoming data:', data);
    } catch (err) {
      return console.error(e);
    }
  };
  channel.onerror = self._errorHandler;
};

Arty.prototype._connectRTC = function() {
  var self = this;
  console.log('connectRTC', self.name);
  var opts = [
    { iceServers: self.iceServers },
    { optional: [{DtlsSrtpKeyAgreement: false}] }
  ];

  console.log('opts:', opts);

  self.pc = new webrtc.RTCPeerConnection(opts);
};

Arty.prototype._makeOffer = function() {
  var self = this;
  self._connectRTC();
  self._makeDataChannel();
  self.pc.onsignalingstatechange = self._onSignalingStateChange;
  self.pc.oniceconnectionstatechange = self._onICEConnectionStateChange;
  self.pc.onicegatheringstatechange = self._onICEGatheringStateChange;
  self.pc.createOffer(function(desc) {
    self.pc.setLocalDescription(desc, function() {
      console.log('set local success');
    });
  });
  self.pc.onicecandidate = function(candidate) {
    self._onICECandidate.apply(self, [candidate]);
  };
};

Arty.prototype._handleOffer = function(data) {
  var self = this;

  console.log('handleOffer...', self.name);
  var offer = new webrtc.RTCSessionDescription(data);

  self._connectRTC();

  self.pc.onsignalingstatechange = self._onSignalingStateChange;
  self.pc.oniceconnectionstatechange = self._onICEConnectionStateChange;
  self.pc.onicegatheringstatechange = self._onICEGatheringStateChange;
  self.pc.onicecandidate = function(candidate) {
    console.log('handleOffer candidate...', self.name);
    self._onICECandidate.apply(self, [candidate]);
  };
  self._handleDataChannels(offer);
};

Arty.prototype._handleDataChannels = function(offer) {
  var self = this;
  console.log('handle data channel', self.name);
  var dataChannelSettings = {
    reliable: {
      ordered: true,
      maxRetransmits: 0
    },
  };
  var labels = Object.keys(dataChannelSettings);
  console.log('labels:', labels);
  self.pc.ondatachannel = function(evt) {
    console.log('datachannel!', evt);

    var channel = evt.channel;
    var label = channel.label;
    self._pendingDataChannels[label] = channel;
    channel.onopen = function() {
      console.log('channel open!');
      self._dataChannels[label] = channel;
      delete self._pendingDataChannels[label];
      if (Object.keys(self._dataChannels).length === labels.length) {
        console.log('connected! :)');
      }
    };
    channel.onmessage = function(evt) {
      try {
        var data = JSON.parse(evt.data);
        console.log('channel data:', data);
        self.emit('message', data);
      } catch (e) {
        console.error(e);
      }
    };
  };

  console.log('datachannel, setting remote description...');
  console.log('dat offer:', offer);

  self.pc.setRemoteDescription(offer, function() {
    self.pc.createAnswer(function(answer) {
      console.log('_createAnswer', answer);
      self.pc.setLocalDescription(answer, function() {
        console.log('set local success!');
      }, self._errorHandler);
      self.emit('answer', answer);
    }, self._errorHandler);
  }, self._errorHandler);
};

Arty.prototype._setRemoteDescription = function(desc) {
  var self = this;
  self.pc.setRemoteDescription(desc);
};

Arty.prototype._setLocalDescription = function(desc) {
  var self = this;
  self.pc.setLocalDescription(desc);
};

Arty.prototype._onICECandidate = function(candidate) {
  var self = this;
  console.log('onicecandidate!', self.name);
  if (candidate.candidate === null) {
    console.log('CONSOLE LOGGING THE NULL ROUTE!  expecting an answer');
    console.log('local description:', self.pc.localDescription);
    self.emit('offer', self.pc.localDescription);
  }
};
Arty.prototype._onSignalingStateChange = function(state) {
  //console.info('signaling state change:', state);
};
Arty.prototype._onICEConnectionStateChange = function(state) {
  //console.info('ice connection state change:', state);
};
Arty.prototype._onICEGatheringStateChange = function(state) {
  //console.info('ice gathering state change:', state);
};

Arty.prototype._route = function(message) {
  console.log('received message:', message);
  this.emit('message', message);
};

Arty.prototype.send = function(message) {
  var self = this;
  console.log('self._dataChannels', self._dataChannels);
  console.log('self._pendingDataChannels', self._pendingDataChannels);
};

Arty.prototype._broadcast = function(message) {
  for (var peer in this.peers) {
    this.peers[peer].send(message);
  }
};

module.exports = Arty;
