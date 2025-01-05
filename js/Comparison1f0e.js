"use strict";
(function () {
  let template = getInnerContent("#template-comparison");
  if (!template) {
    return;
  }
  function Comparison() {
    let qualityRange = null,
      qualityInput = null,
      imageComparison = null,
      compressAjax = null,
      thumb = null,
      gifFrames = null;
    const self = new Bind({
      template: template,
      data: {
        quality: 0,
        item: {},
        size_optimized: 0,
        isPreview: false,
        divider: 0.5,
        optimized_loaded: false,
        original_loaded: false,
        disable_range: true,
        cursorMove: false
      },
      computed: {
        size_original: function () {
          return this.item.size;
        },
        size_human_original: function () {
          return getHumanSize(this.size_original);
        },
        size_human_optimized: function () {
          return getHumanSize(this.size_optimized);
        },
        savings: function () {
          return Math.round((1 - this.size_optimized / this.item.size) * 100);
        },
        range_type: function () {
          if (!this.item.response) {
            return;
          }
          if (this.item.response.hasOwnProperty("compressed_colors")) {
            return "colors";
          }
          return "quality";
        },
        range_min: function () {
          return this.item.response ? this.item.response.params[this.range_type + "_min"] : 0;
        },
        range_max: function () {
          return this.item.response ? this.item.response.params[this.range_type + "_max"] : 100;
        }
      },
      methods: {
        onInputChange: function (event) {
          qualityRange.value = event.target.value;
          if (this.quality == qualityRange.value) {
            return;
          }
          this.quality = qualityRange.value;
          qualityInput.value = this.quality;
          this.compress();
        },
        proceed: function (type) {
          this.disable_range = true;
          if (type == "compress") {
            compressAjax = app.preview(this.item)
              .onLoad(onLoad.bind(this))
              .onError(onError.bind(this))
              .onFinal(onFinal);
          } else {
            app.process(this.item, "optimize")
              .onLoad(onLoad.bind(this))
              .onError(onError.bind(this));
          }
          function onLoad(response) {
            if (this.item.id != response.fid) {
              return;
            }
            this.setImage(
              "optimized",
              appSettings.origin + response.compressed_url,
              {
                id: response && response.fid,
                successCallback: successCallback.bind(this, response)
              })
          }
          function onError(err) {
            err != "abort" && app.notify(appText.error, this.item.name);
            this.optimized_loaded = true;
            this.disable_range = !this.original_loaded;
          }
          function onFinal() {
            compressAjax = null;
          }
          function successCallback(response) {
            let isCompress = type == "compress";
            this.quality = response[(isCompress ? "compressed_" : "optimized_") + this.range_type];
            this.size_optimized = response.compressed_size;
            this.isPreview = isCompress;
          }

        },
        compress: function () {
          this.proceed("compress");
        },
        optimize: function () {
          this.proceed("optimize");
        },
        setImage: function (key, src, options) {
          let opKey = key == "original" ? "optimized" : "original",
            img = new Image();
          if (options && this.item && this.item.id != options.id) {
            return;
          }
          img.addEventListener("load", successCallback.bind(this, img));
          img.addEventListener("error", errorCallback.bind(this));
          if (GifFrames && this.isGif()) {
            gifFrames.setImage(key, src, {
              id: options && options.id,
              successCallback: function (src) {
                img.src = src;
              },
              errorCallback: errorCallback.bind(this)
            });
          } else {
            GifFrames && gifFrames && gifFrames.clear();
            img.src = typeof src == "string" ? src : src[0];
          }
          function successCallback(img) {
            if (options && this.item && this.item.id != options.id) {
              return;
            }
            this[key + "_loaded"] = true;
            this.disable_range = !this[opKey + "_loaded"];
            imageComparison.setImage(key, img);
            options && options.successCallback && options.successCallback();
          }
          function errorCallback() {
            this[key + "_loaded"] = true;
            this.disable_range = !this[opKey + "_loaded"];
            app.notify(appText.error, this.item.name);
            options && options.errorCallback && options.errorCallback();
          }
        },
        isGif: function () {
          return this.item.file && this.item.file.type.slice(-3).toLowerCase() == "gif";
        }
      },
      mounted: function () {
        let self = this;
        qualityInput = this.elem.querySelector("#quality");
        qualityRange = this.elem.querySelector(".quality__range-input");
        imageComparison = ImageComparison(this.elem.querySelector("#canvas"), function () {
          self.cursorMove = this.imageSmallerCanvas;
        });
        thumb = new Thumb(this.elem.querySelector("#thumb"));
        new InputNumber(qualityInput);
        new InputRange(qualityRange,
          function () {
            qualityInput.value = this.value;
          },
          (function () {
            this.quality = qualityRange.value;
            this.compress();
          }).bind(this));
        gifFrames = typeof GifFrames != "undefined" ? new GifFrames() : {};
        if (GifFrames && gifFrames) {
          gifFrames.parent = this;
          gifFrames.disabled = this.disable_range;
          this.elem.querySelector("#frameControlSlot").appendChild(gifFrames.elem);
        }
      },
      watch: {
        item: function (value) {
          compressAjax && compressAjax.abort();
          if (!value) {
            this.item = { response: { params: {} } };
            return;
          }
          this._compute("range_type");
          this._compute("range_min");
          this._compute("range_max");
          this.optimized_loaded = false;
          this.original_loaded = false;
          this.disable_range = true;
          this.size_optimized = this.item.response.compressed_size;
          this.quality = this.item.response["compressed_" + this.range_type];
          this.divider = 0.5;
          this.isPreview = false;
          imageComparison.clear();
          imageComparison.resize();
          thumb.update();
          if (this.item.url) {
            this.setImage("original",
              [this.item.url, appSettings.origin + this.item.response.original_url],
              { id: this.item.id }
            );
          }
          if (this.item.response.optimized_url) {
            this.setImage("optimized",
              appSettings.origin + this.item.response.optimized_url,
              { id: this.item.response.fid }
            );
          }
        },
        quality: function (value) {
          if (!this.range_type) { return; }
          app.convertParams[this.range_type] = this.quality;
        },
        divider: function () {
          imageComparison.draw();
        },
        disable_range: function (value) {
          gifFrames.disabled = value;
        }
      }
    });
    function getHumanSize(size) {
      let i = Math.floor(Math.log(size) / Math.log(1024));
      return (size / Math.pow(1024, i)).toFixed(i == 2 ? 1 : 0) * 1 + " " + ["B", "KB", "MB"][i];
    }
    return self;
  }
  function getInnerContent(selector) {
    let elem = document.querySelector(selector),
      content;
    if (!elem) {
      return;
    }
    content = elem.innerText;
    elem.parentNode.removeChild(elem);
    return content;
  }
  window.Comparison = Comparison;
})();
// Gif frames control
(function () {
  let template = getInnerContent("#template-frame-control");
  if (!template) {
    return;
  }
  function GifFrames() {
    let lastStepChange = -1;
    const self = new Bind({
      template: template,
      data: {
        original: {},
        optimized: {},
        parent: null,
        length: 0,
        frame: 0,
        disabled: false,
        scriptState: -1,
        waitingFn: []
      },
      computed: {
        hidden: function () {
          return this.length <= 1;
        }
      },
      methods: {
        setImage: function (type, url, options) {
          "original" == type && this.clear();
          if (this.scriptState == -1) {
            this.loadScript();
          }
          if (this.scriptState < 1) {
            this.waitingFn.push([type, url, Object.assign({}, options)]);
            return;
          }
          const self = this;
          letPromise(typeof url == "string" ? url : url[0]);
          function letPromise(src) {
            self[type].explorer.setFile(src)
              .then(function (buffer) {
                self[type].data = buffer;
                self[type].id = options && options.id;
                self[type].callback = options && options.successCallback;
                return self[type].explorer.readInfo();
              })
              .then(function (info) {
                if (self.length != info.images.length) {
                  self.length = info.images.length;
                  self.frame = 0;
                }
                return self[type].explorer.readImage(self.frame);
              })
              .then(function (imageData) {
                self[type].callback && self[type].callback(self.dataToImage(imageData));
              })
              .catch(function (err) {
                if (typeof url != "string" && url.length > 1) {
                  letPromise(url[1]);
                  return;
                }
                console.log(err)
                options && options.errorCallback(err);
              });
          }
        },
        getInputWidth: function (length) {
          return (length * 12 || 2) + "px";
        },
        clear: function () {
          this.length = 0;
          (["original", "optimized"]).forEach((function (key) {
            this[key].id = null;
            if (this[key].data) {
              delete this[key].data;
            }
            this[key].data = null;
            if (this[key].toc) {
              delete this[key].toc;
            }
            this[key].toc = null;
            if (typeof GifReader == "undefined") {
              return;
            }
            if (this[key].explorer instanceof GifReader) {
              this[key].explorer.clear();
              return;
            }
            this[key].explorer = new GifReader(appSettings.gif.workerSrc, appSettings.gif.polyfillSrc);
          }).bind(this));
        },
        onInputChange: function (event) {
          let frame = (event.target.value || 1) - 1;
          frame = frame >= this.length ? this.length - 1 : frame;
          frame = frame <= 0 ? 0 : frame;
          this.frame = frame;
          lastStepChange == -1 && requestAnimationFrame(this.checkStepChange.bind(this));
          lastStepChange = performance.now();
          event.target.value = this.frame + 1;
        },
        step: function (value) {
          let frame = this.frame + value;
          if (frame < 0) {
            frame %= this.length;
            frame += this.length;
          }
          if (frame >= this.length) {
            frame %= this.length;
          }
          this.frame = frame;
          lastStepChange == -1 && requestAnimationFrame(this.checkStepChange.bind(this));
          lastStepChange = performance.now();
        },
        dataToImage: function (imageData) {
          let canvas = document.createElement("canvas"),
            ctx = canvas.getContext("2d");
          canvas.width = imageData.width;
          canvas.height = imageData.height;
          ctx.putImageData(imageData, 0, 0);
          return canvas.toDataURL();
        },
        checkStepChange: function () {
          if (performance.now() - lastStepChange < 375) { // check delay
            requestAnimationFrame(this.checkStepChange.bind(this));
            return;
          }
          let types = {
            "original": false,
            "optimized": false
          };
          lastStepChange = -1;
          for (let iter in types) {
            let type = iter;
            self[type].explorer.readImage(self.frame)
              .then(function (imageData) {
                let clone = null;
                try {
                  clone = new ImageData(imageData.data.slice(0, imageData.data.byteLength), imageData.width, imageData.height);
                } catch (err) {
                  clone = new ImageData(imageData.data, imageData.width, imageData.height);
                }
                try {
                  delete imageData.data;
                } catch (err) { }
                types[type] = clone;
                callback();
              })
          }
          function callback() {
            if (!types.original || !types.optimized) {
              return;
            }
            self.original.callback && self.original.callback(self.dataToImage(types.original));
            self.optimized.callback && self.optimized.callback(self.dataToImage(types.optimized));
            delete types.original;
            delete types.optimized;
          }
        },
        loadScript: function () {
          if (this.scriptState > -1) {
            return;
          }
          let script = document.createElement("script");
          script.async = true;
          script.addEventListener("load", onLoad.bind(this));
          script.addEventListener("error", onError.bind(this));
          script.addEventListener("readystatechange", onReadyStateChange.bind(this));
          function onLoad() {
            this.scriptState = 1;
          }
          function onError() {
            this.scriptState = -1;
          }
          function onReadyStateChange() {
            if (script.readyState != "loaded" && script.readyState != "completed") {
              return;
            }
            this.scriptState = 1;
          }
          script.src = appSettings.gif.src;
          document.body.appendChild(script);
          this.scriptState = 0;
        }
      },
      watch: {
        scriptState: function (value) {
          if (value < 1) {
            return;
          }
          this.clear();
          for (let i in this.waitingFn) {
            this.setImage.apply(this, this.waitingFn[i]);
          }
          this.waitingFn.splice(0, this.waitingFn.length);
        }
      },
      mounted: function () {
        new InputNumber(this.elem.querySelector("#counter"));
      },
    });
    return self;
  }
  function getInnerContent(selector) {
    let elem = document.querySelector(selector),
      content;
    if (!elem) {
      return;
    }
    content = elem.innerText;
    elem.parentNode.removeChild(elem);
    return content;
  }
  window.GifFrames = GifFrames;
})();
// Input Range
(function () {
  function InputRange(input, inputCallback, changeCallback) {
    const mobileQuery = window.matchMedia('(max-width: 555px)'),
      KEY_DELAY = 700,
      keyDown = {
        last: -KEY_DELAY,
        id: -1
      },
      isIE = !!navigator.userAgent.match(/Trident.*rv\:11\./);
    let mousedown = false;
    init();
    function init() {
      let media = window.matchMedia('(orientation: portrait)');
      window.addEventListener("resize", resize);
      window.addEventListener("load", resize);
      if (media.addEventListener) {
        media.addEventListener("change", resize);
      } else {
        media.addListener(resize);
      }
      isIE && input.addEventListener("mousedown", onMousedown);
      input.addEventListener("input", onInput);
      input.addEventListener("change", onInput);
      input.addEventListener("keydown", onDown);
      input.addEventListener("touchstart", function () { }, { passive: true });
      resize();
    }
    function onMousedown() {
      mousedown = true;
      window.addEventListener("mouseup", onMouseup);
    }
    function onMouseup() {
      window.removeEventListener("mouseup", onMouseup);
      mousedown = false;
      changeCallback && setTimeout(changeCallback.bind(input), 500);
    }
    function onDown(event) {
      if ([37, 38, 39, 40].indexOf(event.keyCode) != -1) {
        cancelAnimationFrame(keyDown.id);
        keyDown.last = performance.now();
        keyDown.id = requestAnimationFrame(onInput.bind(input, null, true));
      }
    }
    function onInput(event, byKey) {
      let throwChange = performance.now() - keyDown.last > KEY_DELAY;
      inputCallback && inputCallback.call(input);
      if (!throwChange) {
        cancelAnimationFrame(keyDown.id);
        keyDown.id = requestAnimationFrame(onInput.bind(input, null, true));
        return;
      }
      if (!mousedown && (event && event.type == "change" || byKey)) {
        changeCallback && changeCallback.call(input);
      }
    }
    function resize() {
      if (mobileQuery.matches) {
        input.style.removeProperty("left");
        input.style.removeProperty("width");
      } else {
        input.style.left = input.parentNode.offsetWidth / 2 + "px";
        input.style.width = input.parentNode.offsetHeight + "px";
      }
      onInput();
    }
  }
  window.InputRange = InputRange;
})();
// Input Number
(function () {
  function InputNumber(input) {
    const events = ["input", "keydown", "keyup", "mousedown", "mouseup", "select", "contextmenu", "drop"],
      last = {
        value: null,
        start: null,
        end: null
      }
    init();
    function init() {
      for (let index in events) {
        input.addEventListener(events[index], onInputChange, true);
      }
    }
    function onInputChange(event) {
      if (/^\d*$/.test(this.value)) {
        last.value = this.value;
        last.start = this.selectionStart;
        last.end = this.selectionEnd;
      } else if (last.value !== null) {
        this.value = last.value;
        this.setSelectionRange(last.start, last.end);
      } else {
        this.value = "";
      }
    }
  }
  window.InputNumber = InputNumber;
})();
// Thumb
(function () {
  const THUMB_EDGE = 30;
  function Thumb(elem) {
    const params = {
      startX: null,
      curX: null,
      edge: 0
    }, parent = elem.parentNode;
    elem.addEventListener("pointerdown", onMousedown);
    window.addEventListener("resize", onResize);
    onResize();
    return {
      update: onResize
    }
    function onMousedown(event) {
      window.addEventListener("pointermove", onMousemove, { passive: true });
      window.addEventListener("pointerup", onMouseup);
      onMousemove(event);
      params.startX = params.curX;
      onResize();
      params.requestId = requestAnimationFrame(redraw);
    }
    function onResize() {
      params.parentRect = parent.getBoundingClientRect();
      params.edge = THUMB_EDGE / params.parentRect.width;
      setTranslate();
    }
    function onMousemove(event) {
      params.curX = event.clientX;
    }
    function onMouseup(event) {
      window.removeEventListener("pointermove", onMousemove, { passive: true });
      window.removeEventListener("pointerup", onMouseup);
      cancelAnimationFrame(params.requestId);
    }
    function redraw() {
      setValue();
      setTranslate();
      params.requestId = requestAnimationFrame(redraw);
    }
    function setValue(value) {
      if (!value) {
        value = (params.curX - params.parentRect.left) / params.parentRect.width;
        value = Math.max(Math.min(value, 1 - params.edge), params.edge);
      }
      comparison.divider = value;
    }
    function setTranslate() {
      let px = comparison.divider * params.parentRect.width;
      elem.style.transform = 'translate3d(' + px + 'px,0,0)';
      elem.style.transform = 'translate(' + px + 'px,0)';
    }
  }
  window.Thumb = Thumb;
})();
// Canvas Comparison
(function () {
  function ImageComparison(canvas, onDraw) {
    const CELL_SIZE = 10,
      background_pattern = createBackgroundPattern(CELL_SIZE),
      context = canvas.getContext("2d"),
      params = {
        startX: 0,
        startY: 0,
        currentX: 0,
        currentY: 0,
        width: 0,
        height: 0,
      },
      image = {
        original: null,
        optimized: null,
        x: 0,
        y: 0,
        width: 0,
        height: 0
      },
      self = {
        draw: draw,
        setImage: set,
        clear: clear,
        resize: onResize,
        imageSmallerCanvas: false
      };
    window.addEventListener("resize", onResize);
    canvas.addEventListener("pointerdown", onMousedown);
    onResize();
    return self;
    function onMousedown(event) {
      window.addEventListener("pointerup", onMouseup);
      window.addEventListener("pointermove", onMousemove, { passive: true });
      image.startX = image.x;
      image.startY = image.y;
      params.startX = event.clientX;
      params.startY = event.clientY;
      draw(true);
    }
    function onMousemove(event) {
      params.currentX = event.clientX;
      params.currentY = event.clientY;
      let x = image.startX + (params.currentX - params.startX);
      let y = image.startY + (params.currentY - params.startY);
      if (image.width > params.width) {
        image.x = Math.max(Math.min(x, 0), params.width - image.width);
      }
      if (image.height > params.height) {
        image.y = Math.max(Math.min(y, 0), params.height - image.height);
      }
    }
    function onMouseup() {
      window.removeEventListener("pointerup", onMouseup);
      window.removeEventListener("pointermove", onMousemove, { passive: true });
      cancelAnimationFrame(params.requestId);
    }
    function draw(repeat) {
      let center = params.width * comparison.divider;
      context.fillStyle = background_pattern;
      context.fillRect(0, 0, params.width, params.height);
      if (center >= image.x && image.original) {
        let dif = (center - image.x) / image.width,
          width = Math.min(image.width, image.width * dif);
        context.drawImage(
          image.original,
          0, 0, width, image.height,
          image.x, image.y, width, image.height
        );
      }
      if (center <= image.x + image.width && image.optimized) {
        let shift = Math.max(center - image.x, 0),
          dif = 1 - shift / image.width,
          width = Math.min(image.width, image.width * dif),
          x = Math.max(center, image.x);
        context.drawImage(
          image.optimized,
          shift, 0, width, image.height,
          x, image.y, width, image.height
        );
      }
      if (repeat) {
        params.requestId = requestAnimationFrame(draw.bind(null, true));
      }
      if (image.width > params.width || image.height > params.height) {
        self.imageSmallerCanvas = true;
      } else {
        self.imageSmallerCanvas = false;
      }
      onDraw && onDraw.call(self);
    }
    function clear() {
      image.original = null;
      image.optimized = null;
      image.x = 0;
      image.y = 0;
      image.width = 0;
      image.height = 0;
      draw();
    }
    function set(key, img) {
      if (image.width != img.naturalWidth) {
        image.width = img.naturalWidth;
        image.x = params.width / 2 - image.width / 2;
      }
      if (image.height != img.naturalHeight) {
        image.height = img.naturalHeight;
        image.y = params.height / 2 - image.height / 2;
      }
      image[key] = img;
      draw();
    }
    function onResize() {
      if (params.width == canvas.parentNode.offsetWidth && params.height == canvas.parentNode.offsetHeight) {
        return;
      }
      params.width = canvas.parentNode.offsetWidth;
      params.height = canvas.parentNode.offsetHeight;
      canvas.width = params.width;
      canvas.height = params.height;
      image.x = params.width / 2 - image.width / 2;
      image.y = params.height / 2 - image.height / 2;
      draw();
    }
  }
  function createBackgroundPattern(cellSize) {
    const canvas = document.createElement("canvas"),
      context = canvas.getContext("2d", { alpha: false });
    canvas.width = cellSize * 2;
    canvas.height = cellSize * 2;
    context.fillStyle = "#fff";
    context.fillRect(0, 0, cellSize, cellSize);
    context.fillRect(cellSize, cellSize, cellSize, cellSize);
    context.fillStyle = "#eee";
    context.fillRect(cellSize, 0, cellSize, cellSize);
    context.fillRect(0, cellSize, cellSize, cellSize);
    return context.createPattern(canvas, "repeat");
  }
  window.ImageComparison = ImageComparison;
})();