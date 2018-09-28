var createError = require('http-errors');
var express = require('express');
var path = require('path');
var cookieParser = require('cookie-parser');
var logger = require('morgan');
const mysql = require('mysql');
var AsyncLock = require('async-lock');
var lock = new AsyncLock({timeout: 3000});
var key = "theKEY";
var app = express();


// need to setup the own mysql database
var connection = mysql.createConnection({
    host : 'localhost',
    user : '',
    password : '',
    database : 'upgrade',
    multipleStatements: true
});

var dates = new Array(30);
var rowsLocal;
// view engine setup
app.set('views', path.join(__dirname, 'views'));
app.set('view engine', 'ejs');

app.use(logger('dev'));
app.use(express.json());
app.use(express.urlencoded({ extended: false }));
app.use(cookieParser());
app.use(express.static(path.join(__dirname, 'public')));

app.post('/', function(req,res,next){
    let sDate = req.body.sdate.split("-"),
        eDate= req.body.edate.split("-"),
        sDateD = new Date(sDate[1]+"/"+sDate[2]+"/"+sDate[0]),
        eDateD = new Date(eDate[1]+"/"+eDate[2]+"/"+eDate[0]),
        timeDifference = (eDateD.getTime() - sDateD.getTime()),
        dayDifference = Math.ceil(timeDifference / (1000 * 3600 * 24)),
        today = new Date(),
        todayAndStarting = Math.ceil((sDateD.getTime()-today.getTime()) / (1000 * 3600 * 24));

    if(dayDifference<0){
        res.render('index',{title: 'Jaewon Simon Lee',err:"wrong date",rows:rowsLocal,dates:dates});
    }
    else if(dayDifference=0){
        res.render('index',{title: 'Jaewon Simon Lee',err:"Need to stay at least 1 day",rows:rowsLocal,dates:dates});
    }
    else if(dayDifference>3){
        res.render('index',{title: 'Jaewon Simon Lee',err:"MAX 3 days",rows:rowsLocal,dates:dates});
    }
    else if(todayAndStarting<0){
        res.render('index',{title: 'Jaewon Simon Lee',err:"You need to book at least 1 day ahead",rows:rowsLocal,dates:dates});
    }
    else if(todayAndStarting>30){
        res.render('index',{title: 'Jaewon Simon Lee',err:"You need to book only a month ahead",rows:rowsLocal,dates:dates});
    }
    lock.acquire("key1", function(done) {
        console.log("lock1 enter")
        connection.query('CREATE TABLE IF NOT EXISTS reservation(' +
            'id INT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,' +
            'startingDate DATE NOT NULL,'+
            'endingDate DATE NOT NULL,' +
            'fname varchar(60) NOT NULL,'+
            'lname varchar(60) NOT NULL,'+
            'email varchar(60) NOT NULL);'
            , (err,rows,fields)=>{
            if(err){
                console.log(err);
                res.render('index',{title: 'Jaewon Simon Lee',err:"DATABASE ERROR",rows:rowsLocal,dates:dates});
            }
            connection.query('SELECT count(*) as count from reservation where email = \'' + req.body.userEmail+'\' and endingDate > (CURDATE());',
            (err,rows,fields)=>{
            if(err){
                console.log(err);
            }
            if(rows[0].count<=0 ||rows[0].count==undefined){
            connection.query('SELECT count(*) as count from reservation where startingDate < STR_TO_DATE(\''+req.body.edate+'\',\'%Y-%m-%d\')' +
                'IN (SELECT startingDate where endingDate > STR_TO_DATE(\''+req.body.sdate+'\',\'%Y-%m-%d\'));'
                , (err,rows,fields)=>{
                if(err) {
                    console.log(err);
                }

                let count = rows[0].count;

            if(count == 0){

                connection.query('INSERT INTO reservation VALUES(' +
                    'null,' +
                    'STR_TO_DATE(\''+req.body.sdate+'\',\'%Y-%m-%d\'),' +
                    'STR_TO_DATE(\''+req.body.edate+'\',\'%Y-%m-%d\'),' +
                    '\''+req.body.fname +'\',' +
                    '\''+req.body.lname +'\',' +
                    '\''+req.body.userEmail+'\');\n' +
                    'SELECT LAST_INSERT_ID() as last;',
                    (err,rows,fields)=>{
                    if(err){
                        console.log(err);
                        res.render('index',{title: 'Jaewon Simon Lee',err:"Insert error",rows:rowsLocal,dates:dates});
                    }
                    else{
                        res.render('index',{title: 'Jaewon Simon Lee',err:"Reservation Made, "+rows[1][0].last+" is your confirmation number",rows:rowsLocal,dates:dates})
                }
            }
            )
            }
            else{
                res.render('index',{title: 'Jaewon Simon Lee',err:"Someone took the spot you wanted",rows:rowsLocal,dates:dates});
            }
        });
        }
        else {
            res.render('index',{title: 'Jaewon Simon Lee',err:"You already have reservation",rows:rowsLocal,dates:dates});
        }
    }
        )
    });
        done(new Error('error'));
    }, function(err, ret) {
        console.log("lock1 release")
    }, {});
});

app.get('/', function(req, res, next) {
    connection.query('select * from reservation where startingDate > (CURDATE()-1) order by startingDate ASC;',
        (err,rows,fields)=>{
        console.log(rows);
        if(!err){
            rowsLocal = rows;
            dates = new Array(30);
            for(var i = 0;i<rows.length;i++){
    
                let sDateDifference = Math.ceil((rows[i].startingDate.getTime()-new Date().getTime())/ (1000 * 3600 * 24));
    
                let duration = Math.ceil((rows[i].endingDate.getTime()-rows[i].startingDate.getTime())/ (1000 * 3600 * 24));
    
                console.log(sDateDifference,duration);
                for(var j = 0; j<duration;j++){
                    if((sDateDifference+j)>=0){
                        dates[sDateDifference+j] = 1;
                    }
                }
                console.log(dates);
            }
        }
        res.render('index', { title: 'Jaewon Simon Lee',err:null,rows:rowsLocal,dates:dates});
    })
});

// DELETE, has to be "delete, instead of get" for the normal request gather scheme
app.get('/delete',function(req,res,next){
    console.log(req.query);
    console.log("delete from reservation where id = "+req.query.id + ", userEmail = \'"+req.query.email+"\';");
    connection.query("delete from reservation where id = "+req.query.id + " and email = \'"+req.query.email+"\';",(err,rows,fields)=>{
        console.log(err);
        if(!err){
            res.redirect('/');
        }
    });
});

// catch 404 and forward to error handler
app.use(function(req, res, next) {
    next(createError(404));
});



// error handler
app.use(function(err, req, res, next) {
    // set locals, only providing error in development
    res.locals.message = err.message;
    res.locals.error = req.app.get('env') === 'development' ? err : {};

    // render the error page
    res.status(err.status || 500);
    res.render('error');
});

module.exports = app;
