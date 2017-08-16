
function create() {
  let currentMean = 0;
  let currentCount = 0;

  function elapsedTime(start){
    const [s, nano] = process.hrtime(start);    
    const total = s + nano / 1000000000;
    const elapsed = Math.round(total * 100) / 100;

    const currentTotal = currentMean * currentCount + elapsed;
    currentCount++;
    currentMean = currentTotal / currentCount;

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
    const timeEstimate = forAmount * currentMean; // in seconds.
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

module.exports = {
  create
};
