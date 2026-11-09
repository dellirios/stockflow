'use strict';
// Isolated, non-printing checks. Never enable production polling or consume real orders.
const {spawnSync}=require('node:child_process');
const path=require('node:path');
const files=[
 'weightFormatting.test.js','elginLabelLayout.test.js','printerGeometry.test.js','zebraLabelLayout.test.js',
 'zebraFeedback.test.js','printFeedbackMonitor.test.js','printFeedbackOutbox.test.js',
 'printerCalibration.test.js','printerCircuitRecovery.test.js','printerTelemetry.test.js',
 'agentHeartbeat.test.js','etiquetasRoute.test.js',
];
const env={...process.env,NODE_ENV:'test',ZEBRA_FEEDBACK_LOCAL_ONLY:'false',
 PRINT_FEEDBACK_TOKEN:'',PRINT_FEEDBACK_EVENTS_URL:'',LONG_POLL_URL:'https://example.invalid/start.php'};
let failed=0;
for(const file of files){
 const result=spawnSync(process.execPath,[path.join(__dirname,file)],{env,stdio:'inherit',timeout:30000});
 if(result.status!==0){failed++;console.error('FAIL',file,result.error?.message||result.signal||result.status);}
}
const unit=spawnSync(process.execPath,['-e',"const r=require('./tests/printerService.test').runTests();process.exit(r.failed?1:0)"],
 {cwd:path.resolve(__dirname,'..'),env,stdio:'inherit',timeout:30000});
if(unit.status!==0){failed++;console.error('FAIL printerService unit checks',unit.error?.message||unit.status);}
console.log('Regression groups:',files.length+1,'Failures:',failed);
process.exit(failed?1:0);
