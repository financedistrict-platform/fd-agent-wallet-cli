const pc = require('picocolors');

function printError(err) {
  if (err.response?.data) {
    const d = err.response.data;
    console.error(`\n  ${pc.red('Error:')}   ${d.error || 'unknown'}`);
    console.error(`  ${pc.red('Detail:')}  ${d.error_description || err.message}`);
    if (d.suberror) console.error(`  ${pc.red('Sub:')}     ${d.suberror}`);
  } else {
    console.error(`\n  ${pc.red('Error:')} ${err.message}`);
  }
}

module.exports = { printError };
