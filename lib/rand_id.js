
var chars = 'abcdefghiklmnopqrstuvwxyz';
module.exports = function rand_id() {
    var randomstring = '';
    for (var i=0; i<4; ++i) {
        var rnum = Math.floor(Math.random() * chars.length);
        randomstring += chars[rnum];
    }

    return randomstring;
}

