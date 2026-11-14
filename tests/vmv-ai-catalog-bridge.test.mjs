import test from "node:test";
import assert from "node:assert/strict";
import {buildCatalogSnapshot} from "../lib/vmv-ai-agents/catalog-snapshot.ts";

const item=(overrides={})=>({
 id:"a",sku:"C-1",name:"Example",description:"Merchant approved",
 price_cents:2500,currency:"usd",stock_mode:"tracked",
 available_qty:5,variants:[],extras:[],web_source_id:null,...overrides
});
test("tracked inventory subtracts all active holds returned by server",()=>{
 const result=buildCatalogSnapshot([item()],[
  {item_id:"a",qty:2},{item_id:"a",qty:1},{item_id:"other",qty:5}
 ]);
 assert.equal(result[0].availableQuantity,2);
 assert.equal(result[0].priceCents,2500);
 assert.equal(result[0].sellableInTest,true);
});
test("holds cannot create negative available quantities",()=>{
 const result=buildCatalogSnapshot([item({available_qty:2})],[{item_id:"a",qty:4}]);
 assert.equal(result[0].availableQuantity,0);
 assert.equal(result[0].sellableInTest,false);
});
test("manual stock is never presented as a confirmed available amount",()=>{
 const result=buildCatalogSnapshot([item({stock_mode:"manual",available_qty:null})],[]);
 assert.equal(result[0].availableQuantity,null);
 assert.equal(result[0].availability,"manual");
 assert.equal(result[0].sellableInTest,false);
});
test("explicit unlimited setting is labeled, not invented quantity",()=>{
 const result=buildCatalogSnapshot([item({stock_mode:"unlimited",available_qty:null})],[]);
 assert.equal(result[0].availableQuantity,null);
 assert.equal(result[0].availability,"unlimited");
 assert.equal(result[0].sellableInTest,true);
});
test("unsupported priced variants never become automatically orderable",()=>{
 const result=buildCatalogSnapshot([item({variants:[{title:"large"}]})],[]);
 assert.equal(result[0].supportsSimpleOrder,false);
 assert.equal(result[0].sellableInTest,false);
});
test("invalid prices or currency are omitted from published merchant snapshot",()=>{
 const result=buildCatalogSnapshot([
  item({id:"invalid",price_cents:0}),item({id:"wrong",currency:"eur"}),
  item({id:"valid",price_cents:1234})
 ],[]);
 assert.deepEqual(result.map(x=>x.id),["valid"]);
 assert.equal(result[0].priceCents,1234);
});
test("linked website product retains its stable source ID",()=>{
 const sourceId="11111111-1111-4111-8111-111111111111";
 const [product]=buildCatalogSnapshot([item({web_source_id:sourceId})],[]);
 assert.equal(product.webSourceId,sourceId);
});
