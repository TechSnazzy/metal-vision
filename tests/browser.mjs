import { chromium } from '@playwright/test';
import assert from 'node:assert/strict';
const browser = await chromium.launch({executablePath:process.env.CHROMIUM_PATH || '/usr/bin/chromium',headless:true,args:['--no-sandbox']});
const base = process.env.TEST_URL || 'http://127.0.0.1:8080/';
try {
  for (const viewport of [{width:1440,height:1100},{width:390,height:844},{width:320,height:740}]) {
    const page = await browser.newPage({viewport});
    const errors=[];page.on('pageerror',e=>errors.push(e.message));
    await page.route('https://www.youtube.com/iframe_api',route=>route.fulfill({contentType:'text/javascript',body:`
      window.YT={Player:class {
        constructor(id,opts){this.events=opts.events;this.time=0;this.el=document.createElement('iframe');this.el.id=id;this.el.title='Test video';document.getElementById(id).replaceWith(this.el);window.testPlayer=this;setTimeout(()=>this.events.onReady(),10);}
        loadVideoById(v){this.video=v;this.time=v.startSeconds;this.events.onStateChange({data:1});}
        getIframe(){return this.el;}getDuration(){return 300;}getCurrentTime(){return this.time;}
        pauseVideo(){this.events.onStateChange({data:2});}stopVideo(){}seekTo(t){this.time=t;}
      }};window.onYouTubeIframeAPIReady();
    `}));
    await page.goto(base);
    await page.locator('#tune:not([disabled])').waitFor();
    assert.ok(await page.locator('#up-next li').count()>0);
    assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));
    await page.screenshot({path:`/tmp/metal-vision-${viewport.width}.png`,fullPage:true});
    await page.locator('#tune').click();
    await page.waitForFunction(()=>window.testPlayer?.video);
    assert.equal(await page.locator('#standby').isVisible(),false);
    await page.locator('#restart').click();
    assert.equal(await page.evaluate(()=>window.testPlayer.video.startSeconds),0);
    const before = await page.evaluate(()=>window.testPlayer.video.videoId);
    await page.locator('#next').click();
    assert.notEqual(await page.evaluate(()=>window.testPlayer.video.videoId),before);
    await page.evaluate(()=>window.testPlayer.events.onError({data:150}));
    assert.match(await page.locator('#message').innerText(),/unavailable/);
    await page.evaluate(()=>window.testPlayer.events.onAutoplayBlocked());
    assert.match(await page.locator('#message').innerText(),/Press play/);
    await page.locator('#theater').click();
    assert.equal(await page.locator('#theater').getAttribute('aria-pressed'),'true');
    await page.locator('#theater').click();
    await page.locator('#power').click();
    assert.equal(await page.locator('#standby').isVisible(),true);
    await page.locator('#about-open').click();
    assert.equal(await page.locator('#about').isVisible(),true);
    await page.keyboard.press('Escape');
    assert.equal(await page.locator('#about').isVisible(),false);
    assert.deepEqual(errors,[]);
    console.log(`PASS ${viewport.width}px: layout, tune, restart, next, unavailable clip, autoplay, theater, power, about`);
    await page.close();
  }
} finally {await browser.close();}
