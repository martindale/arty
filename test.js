var Fabric = require('./src/arty');
var node1 = new Fabric();
var node2 = new Fabric();

node1.name = 'alice';
node2.name = 'bob';

node2.on('answer', function(answer) {
  console.log('node2 answer...', answer);

  node2._setRemoteDescription(answer);
  node2.send('sup');
});

node1.on('offer', function(candidate) {
  console.log('offer!', node1.name);
  node2._handleOffer(candidate);
});

node1.on('message', messageHandler);
node2.on('message', messageHandler);

function messageHandler(msg) {
  console.log('word!', this.name, msg);
};

node1._makeOffer();
