import {test} from 'node:test';
import assert from 'node:assert/strict';
import {GEV_EXAMPLE,aircraftResult,filterAircraft,reading,areaCentre,polar,rangeFor} from '../src/js/gev-data.js';
test('GEV result is copied without altering source fields',()=>{const c=aircraftResult(GEV_EXAMPLE);assert.deepEqual(c,GEV_EXAMPLE);c.data.rows[0].callsign='changed';assert.notEqual(c.data.rows[0].callsign,GEV_EXAMPLE.data.rows[0].callsign)});
test('filter by callsign, address and airborne state',()=>{assert.equal(filterAircraft(GEV_EXAMPLE,'DEMO101').length,1);assert.equal(filterAircraft(GEV_EXAMPLE,'DEMO').length,6);assert.equal(filterAircraft(GEV_EXAMPLE,'abc002')[0].id,'abc002');assert.equal(filterAircraft(GEV_EXAMPLE,'',true).length,6);assert.equal(filterAircraft(GEV_EXAMPLE,'missing').length,0)});
test('missing measurements are unavailable, not zero telemetry',()=>{assert.equal(reading(null,'m'),'Unavailable');assert.equal(reading(0,'m'),'0 m')});
test('invalid results fail without source mutation',()=>{for(const x of [null,{}, {data:{rows:[{id:'bad<script>'}]}},{data:{rows:[{id:'same'},{id:'same'}]}},{data:{rows:[{id:'abc',altitude_m:'unknown'}]}}])assert.throws(()=>aircraftResult(x));assert.equal(GEV_EXAMPLE.data.rows.length,7)});
test('scope places contacts by true bearing from the view centre and picks a round range',()=>{
 const c={lat:0,lon:0};assert.ok(Math.abs(polar(c,{lat:1,lon:0}).brg-0)<1e-6);assert.ok(Math.abs(polar(c,{lat:0,lon:1}).brg-90)<1e-6);assert.ok(Math.abs(polar(c,{lat:-1,lon:0}).brg-180)<1e-6);
 assert.equal(polar(c,{lat:null,lon:0}),null);assert.equal(polar(c,{lat:1,lon:0,distance_km:42}).km,42);
 assert.deepEqual(areaCentre({data:{view:{center:{lat:5,lon:6}},rows:[]}}),{lat:5,lon:6});assert.equal(areaCentre({data:{rows:[]}}),null);
 assert.equal(rangeFor(217),250);assert.equal(rangeFor(20),25);assert.equal(rangeFor(1200),1500);
});
