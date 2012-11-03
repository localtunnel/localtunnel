var server = require("../server.js");
var http = require("http");
var sinon = require("sinon");
var request = require("request");
var expect = require("chai").expect;

describe("localtunnel", function(){
  var spy = sinon.spy();
  var spyBody = sinon.spy();
  var localtunnel = null;
  before(function(done){
    //mock server
    http.createServer(function(req, res){
      req.on('data', spyBody);
      spy(req,res);
      res.end();
    }).listen(2323);
    //localtunnel server
    server.listen(3232);
    process.argv = process.argv.concat(["--port","2323","--host","http://localhost:3232"]);
    localtunnel = require("../client.js");
    done(); 
  });

  it("can return valid external url", function(done){
    localtunnel(function(url){
      expect(url).to.be.ok;
      expect(url).to.match(/^http:\/\/.*localhost:3232$/);
      done();
    })
  });
  it("can proxy external GET requests", function(done){
    var qs = {
      a:1,
      b:2
    };
    localtunnel(function(url){
      spy.reset();
      expect(url).to.be.ok;
      expect(url).to.match(/^http:\/\/.*localhost:3232$/);
      request.get("http://localhost:3232/test1",{qs:qs, 
                  headers:{
                    host:url.slice(7)
                  }}, receiveExternalGetCall);
    })
    function receiveExternalGetCall(err, req, body){
      expect(spy.calledOnce).to.be.ok;
      var spyCall = spy.getCall(0);
      expect(spyCall.args[0].url).to.equal('/test1?a=1&b=2');
      done();
    }
  });
  it("can proxy external POST requests", function(done){
    var body = {
      c:1,
      d:2
    };
    localtunnel(function(url){
      spy.reset();
      spyBody.reset();
      expect(url).to.be.ok;
      expect(url).to.match(/^http:\/\/.*localhost:3232$/);
      request.post("http://localhost:3232/test2",{form:body, 
                  headers:{
                    host:url.slice(7)
                  }}, receiveExternalGetCall);
    })
    function receiveExternalGetCall(err, req, body){
      expect(spy.calledOnce).to.be.ok;
      var spyCall = spy.getCall(0);
      expect(spyCall.args[0].url).to.equal('/test2');
      expect(spyBody.calledOnce).to.be.ok;
      var spyCall = spyBody.getCall(0);
      expect(spyCall.args[0].toString()).to.equal('c=1&d=2');
      done();
    }
  });
});
