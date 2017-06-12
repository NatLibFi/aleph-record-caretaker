const _ = require('lodash');

function create() {
  const last100ExecutionTimes = [];

  function elapsedTime(start){
    const [s, nano] = process.hrtime(start);    
    const total = s + nano / 1000000000;
    const elapsed = Math.round(total * 100) / 100;

    last100ExecutionTimes.push(elapsed);
    if (last100ExecutionTimes.length > 100) {
      last100ExecutionTimes.shift();
    }

    return elapsed;
  }
  function secondsToTimeString(secondsToConvert) {
    
    var hours   = Math.floor(secondsToConvert / 3600);
    var minutes = Math.floor((secondsToConvert - (hours * 3600)) / 60);
    var seconds = Math.floor(secondsToConvert - (hours * 3600) - (minutes * 60));

    if (hours   < 10) {hours   = '0' + hours;}
    if (minutes < 10) {minutes = '0' + minutes;}
    if (seconds < 10) {seconds = '0' + seconds;}
    return `${hours}:${minutes}:${seconds}`;
  }

  function getEstimations(forAmount) {
    const timeEstimate = forAmount * _.mean(last100ExecutionTimes); // in seconds.
    const readyEstimate = new Date();
    readyEstimate.setSeconds(readyEstimate.getSeconds() + timeEstimate);
    return {
      timeEstimate,
      readyEstimate
    };
  }

  return {
    elapsedTime,
    secondsToTimeString,
    getEstimations
  };
}

function decorate(fn) {
  
}

module.exports = {
  create,
  decorate
};
