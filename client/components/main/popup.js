import { BlazeComponent } from 'meteor/peerlibrary:blaze-components';
import { Template } from 'meteor/templating';

const PopupBias = {
  Before: Symbol("S"),
  Overlap: Symbol("M"),
  After: Symbol("A"),
  Fullscreen: Symbol("F"),
  includes(e) {
    return Object.values(this).includes(e);
  }
}

// this class is a bit cumbersome and could probably be done simpler.
// it manages two things : initial placement and sizing given an opener element,
// and then movement and resizing. one difficulty was to be able, as a popup
// which can be resized from the "outside" (CSS4) and move from the inside (inner
// component), which also grows and shrinks frequently, to adapt.
// I tried many approach and failed to get the perfect fit; I feel that there is
// always something indeterminate at some point. so the only drawback is that
// if a popup contains another resizable component (e.g. card details), and if
// it has been resized (with CSS handle), it will lose its dimensions when dragging
// it next time.
class PopupDetachedComponent extends BlazeComponent {
  onCreated() {
    // Set by parent/caller (usually PopupComponent)
    ({ nonPlaceholderOpener: this.nonPlaceholderOpener, closeDOMs: this.closeDOMs = [] } = this.data());


    if (typeof(this.closeDOMs) === "string") {
      // helper for passing arg in JADE template
      this.closeDOMs = this.closeDOMs.split(';');
    }

    // The popup's own header, if it exists
    this.closeDOMs.push("click .js-close-detached-popup");
    // Also try to be smart...
    this.closeDOMs.push("click .js-close");

    this.handleDOM = this.data().handleDOM;
  }

  // Main intent of this component is to have a modular popup with defaults:
  // - sticks to its opener while being a child of body (thus in the same stacking context, no z-index issue)
  // - is responsive on shrink while keeping position absolute
  // - can grow back to initial position step by step
  // - exposes various sizes as CSS variables so each rendered popup can use them to adapt defaults
  // * issue is that it is done by hand, with heurisitic/simple algorithm from my thoughts, not sure it covers edge cases
  // * however it works well so far and maybe more "fixed" element should be popups
  onRendered() {
    this.popup = this.firstNode();
    this.popupOpener = this.data().openerElement;
    this.controlComponent = this.data().controlComponent;
    // So we can bind "this" when handling events, especially for afterConfirm-ish
    this.openerComponent = BlazeComponent.getComponentForElement(this.popupOpener);

    const popupStyle = window.getComputedStyle(this.firstNode());
    // margin may be in a relative unit, not computable in JS, but we get the actual pixels here
    this.popupMargin = parseFloat(popupStyle.getPropertyValue("--popup-margin"), 10) || Math.min(window.innerWidth / 50, window.innerHeight / 50);

    this.draw();
    // popups resize often, better follow them by default;
    this.innerElement = this.find('.content');
    this.observeChild = this.follow();

    $(window).on('resize', () => {
      this.draw();
    });
  }

  draw() {
    if (!this.isRendered()) {return;}
    // Enables us to shrink when window goes little then big
    // Othewise no easy way to know; easier to get shrinked
    if (!this.initialWidthRatio || !this.initialHeightRatio) {
      const maxDims = this.computeMaxDims();
      this.initialWidthRatio = maxDims.width / window.innerWidth;
      this.initialHeightRatio = maxDims.height / window.innerHeight;
      this.initialWidth = maxDims.width;
      this.initialHeight = maxDims.height;
      this.initialWindowWidth = window.innerWidth;
      this.initialWindowHeight = window.innerHeight;
    }
    this.dims(this.computePopupDims());
    this.toFront();
  }

  margin() {
    return this.popupMargin;
  }

  ensureDimsLimit(dims) {
    // boilerplate to make sure that popup visually fits
    let { left, top, width, height } = dims;
    let overflowBottom = top + height + 2 * this.margin() - window.innerHeight;
    let overflowRight = left + width + 2 * this.margin() - window.innerWidth;
    if (overflowRight > 0) {
      width = Math.max(20 * this.margin(), Math.min(width - overflowRight, window.innerWidth - 2 * this.margin()));
    }
    if (overflowBottom > 0) {
      height = Math.max(10 * this.margin(), Math.min(height - overflowBottom, window.innerHeight - 2 * this.margin()));
    }
    left = Math.max(left, this.margin());
    top = Math.max(top, this.margin());
    return { left, top, width, height }
  }

  dims(newDims) {
    if (!this.isRendered() || this.isDestroyed()) {return}
    if (!this.popupDims) {
      this.popupDims = {};
    }
    if (newDims) {
      newDims.top ??= this.popupDims.top;
      newDims.left ??= this.popupDims.left;
      newDims = this.ensureDimsLimit(newDims);
      for (const e of Object.keys(newDims)) {
        let value = parseFloat(newDims[e]);
          if (!isNaN(value)) {
            $(this.popup).css(e, `${value}px`);
            this.popupDims[e] = value;
          }
        }
      }
    return this.popupDims;
  }

  isFullscreen() {
    return this.fullscreen;
  }

  maximize() {
    this.fullscreen = true;
    this.dims(this.computePopupDims());
    if (this.innerElement) {
      $(this.innerElement).css('width', '');
      $(this.innerElement).css('height', '')
    }
  }

  minimize() {
    this.fullscreen = false;
    this.dims(this.computePopupDims());
  }

  follow() {return new ResizeObserver((_) => {
    if (!this.isRendered() || this.isDestroyed()) {
      this.observeChild?.disconnect();
      return;
    }
    if (this.fullscreen) {return}
      const width = this.innerElement.scrollWidth;
      const height = this.innerElement.scrollHeight + (this.find('.header')?.offsetHeight || 0);
      // avoid possible small resizes loops, eg because of constraigned sizing or rounding
      if (Math.abs(this.dims().width - width) < this.dims().width / 10 && Math.abs(this.dims().height - height) < this.dims().height / 10) { return }
      if (this.dims().left + width > window.innerWidth || this.dims().top + height > window.innerHeight) {return;}
      // we don't want to run this during something that we have caused, eg. dragging
      if (!this.mouseDown) {

        // if inner shrinks, follow
        if (width < this.dims().width || height < this.dims().height) {
          this.dims({ width, height });
        }
        // otherwise it may be complicated to find a generic situation, but we have the
        // classic positionning procedure which works, so use it and ignore positionning
        else {
          const newDims = this.computePopupDims();
          // a bit twisted/ad-hoc for card details, in the edge case where they are opened when collapsed then uncollapsed,
          // not sure to understand why the sizing works differently that starting uncollapsed then doing the same sequence
          this.dims(this.ensureDimsLimit({
            top: this.dims().top,
            left: this.dims().left,
            width: Math.max(newDims.width, width),
            height: Math.max(newDims.height, height)
          }));
        }
      }
      else {
        const { width, height } = this.popup.getBoundingClientRect();
        this.popupDims.width = width;
        this.popupDims.height = height;
      }
    }).observe(this.innerElement);
  }

  currentZ(z = undefined) {
    if (z === undefined) {
      return this.popup.style.zIndex || 0;
    }
    if (!z || isNaN(z) ||z === Infinity || z === -Infinity) {
      z = 1;
    }
    // relative, add a constant to be above root elements
    this.popup.style.zIndex = parseInt(z) + 10;
    this.popup.style.zIndex - 10;
  }

  toFront() {
    if (!this.isRendered() || !this.firstNode()) {return}
    this.currentZ(Math.max(...PopupComponent.stack.map(p => p.outerComponent.currentZ())) + 1);

  }

  toBack() {
    if (!this.isRendered() || !this.firstNode()) {return}
    this.currentZ(Math.min(...PopupComponent.stack.map(p => p.outerComponent.currentZ())) + 1);
  }

  events() {
    let closeEvents = {};
    this.closeDOMs?.forEach((e) => {
      closeEvents[e] = (event) => {
        // make sure that we are really the target, just in case; popup can be
        // really frustrating when not behaving as expected
        if (PopupComponent.findParentPopup(event.target) === this) {
          this.controlComponent.destroy();
        }
      }
    })

    const miscEvents = {
      'click .js-confirm'(e) {
        const afterConfirm = this.data().afterConfirm;
        if (afterConfirm) {
          // as the popup stack is a bit more flexible, you can get events
          // from popups at the bottom; it is possible to find back their
          // popup component eg. to destroy them, but just add it to
          // the event; probably a bit dirty but also more deterministic.s
          // Here, the caller can choose what will be "this" in the callback;
          // default to the component which triggered opening of popup, to ease retrocompatibility
          const args = Object.assign(this.data().confirmArgs ?? {}, {popup: this.controlComponent});
          // the original behaviour is to have data of opener as this
          afterConfirm.call(this.data().whatsThis ?? Blaze.getData(this.openerView), e, args);
        }
      },
      // bad heuristic but only for best-effort UI
      'pointerdown .pop-over'() {
        // Useful to do it now in case of dragging
        this.toFront();
        this.mouseDown = true;
      },
      'pointerup .pop-over'() {
        this.mouseDown = false;
      }
    };

    const movePopup = (event) => {
      event.preventDefault();
      $(event.target).addClass('is-active');
      const deltaHandleX = this.dims().left - event.clientX;
      const deltaHandleY = this.dims().top - event.clientY;

      const onPointerMove = (e) => {
        // previously I used to resize popup when reaching border but it's a so bad idea, triggers loop
        // with other resizing/moving mechanisms, and is probably bad in terms of UI.
        // only interest was maybe on mobile where there is no CSS resize
        this.dims(this.ensureDimsLimit({ left: e.clientX + deltaHandleX, top: e.clientY + deltaHandleY }));

        if (this.popup.scrollY) {
          this.popup.scrollTo(0, 0);
        }
      };

      const onPointerUp = (event) => {
        $(document).off('pointermove', onPointerMove);
        $(document).off('pointerup', onPointerUp);
        $(event.target).removeClass('is-active');
      };

      if (Utils.shouldIgnorePointer(event)) {
        onPointerUp(event);
        return;
      }

      $(document).on('pointermove', onPointerMove);
      $(document).on('pointerup', onPointerUp);
    };

    // We do not manage dragging without our own header
    if (this.data().showHeader) {
      const handleSelector = Utils.isMiniScreen() ? '.js-popup-drag-handle' : '.header-title';
      miscEvents[`pointerdown ${handleSelector}`] = (e) => movePopup(e);
    }
    if (this.handleDOM) {
      miscEvents[`pointerdown ${this.handleDOM}`] = (e) => movePopup(e);
    }
    return super.events().concat(closeEvents).concat(miscEvents);
  }

  computeMaxDims() {
    if (!this.isRendered()) {return;}
    // Get size of inner content, even if it overflows
    const content = this.find('.content');
    let popupHeight = content?.scrollHeight;
    let popupWidth = content?.scrollWidth;
    if (this.data().showHeader) {
      const headerRect = this.find('.header');
      popupHeight += headerRect.scrollHeight;
      popupWidth = Math.max(popupWidth, headerRect.scrollWidth)
    }
    return { width: Math.max(popupWidth, $(this.popup).width()), height: Math.max(popupHeight, $(this.popup).height()) };

  }

  placeOnSingleDimension(elementLength, openerPos, openerLength, maxLength, biases, n) {
    // avoid too much recursion if no solution
    if (!n) {
      n = 0;
    }
    if (n >= 5) {
      // if we exhausted a bias, remove it
      n = 0;
      biases.pop();
      if (biases.length === 0) {
        return -1;
      }
    } else {
      n += 1;
    }

    if (!biases?.length) {
      const cut = maxLength / 3;

      if (openerPos < cut) {
        // Corresponds to the default ordering: if element is close to the axe's start,
        // try to put the popup after it; then to overlap; and give up otherwise.
        biases = [PopupBias.After, PopupBias.Overlap]
      }
      else if (openerPos > 2 * cut) {
        // Same idea if popup is close to the end
        biases = [PopupBias.Before, PopupBias.Overlap]
      }
      else {
        // If in the middle, try to overlap: choosing between start or end, even for
        // default, is too arbitrary; a custom order can be passed in argument.
        biases = [PopupBias.Overlap]
      }
    }
    // Remove the first element and get it
    const bias = biases.splice(0, 1)[0];

    let factor;
    const openerRef = openerPos + openerLength / 2;
    if (bias === PopupBias.Before) {
      factor = 1;
    }
    else if (bias === PopupBias.Overlap) {
      factor = openerRef / maxLength;
    }
    else {
      factor = 0;
    }

    let candidatePos = openerRef - elementLength * factor;
    const deltaMax = candidatePos + elementLength - maxLength;
    if (candidatePos < 0 || deltaMax > 0) {
      if (deltaMax <= 2 * this.margin()) {
        // if this is just a matter of margin, try again
        // useful for (literal) corner cases
        biases = [bias].concat(biases);
        openerPos -= 5;
      }
      if (biases.length === 0) {
        // we could have returned candidate position even if the size is too large, so
        // that the caller can choose, but it means more computations and edge cases...
        // any negative means fullscreen overall as the caller will take the maximum between
        // margin and candidate.
        return -1;
      }
      return this.placeOnSingleDimension(elementLength, openerPos, openerLength, maxLength, biases, n);
    }
    return candidatePos;
  }

  computePopupDims() {
    if (!this.isRendered?.()) {
      return;
    }

    // Coordinates of opener related to viewport
    let { x: parentX, y: parentY } = this.nonPlaceholderOpener.getBoundingClientRect();
    let { height: parentHeight, width: parentWidth } = this.nonPlaceholderOpener.getBoundingClientRect();


    // Don't scale the popup down, too bad things can happen, e.g. rescaling it up; scaling content is enough
    let popupHeight = this.initialHeight;
    let popupWidth = this.initialWidth;
    // If redrawing after upscaling the viewport, don't let popup go beyond their initial size
    if (popupWidth > this.initialWidth && this.initialWidthRatio * this.initialWidth >= this.initialWindowWidth) {
      popupWidth = this.initialWidth;
    }
    if (popupHeight > this.initialHeight && this.initialHeightRatio * this.initialHeight >= this.initialWindowHeight) {
      popupHeight = this.initialHeight;
    }


    if (this.fullscreen || Utils.isMiniScreen() && popupWidth >= 4 * window.innerWidth / 5 && popupHeight >= 4 * window.innerHeight / 5) {
      // Go fullscreen!
      popupWidth = window.innerWidth;
      // Avoid address bar, let a bit of margin to scroll
      popupHeight = 4 * window.innerHeight / 5;
      return ({
        width: window.innerWidth,
        height: window.innerHeight,
        left: 0,
        top: 0,
      });
    } else {
      // Current viewport dimensions
      let maxHeight = window.innerHeight - this.margin() * 2;
      let maxWidth = window.innerWidth - this.margin() * 2;
      let biasX, biasY;
      if (Utils.isMiniScreen()) {
        // On mobile I found that being able to close a popup really close from where it has been clicked
        // is comfortable; so given that the close button is top-right, we prefer the position of
        // popup being right-bottom, when possible. We then try every position, rather than choosing
        // relatively to the relative position of opener in viewport
        biasX = [PopupBias.Before, PopupBias.Overlap, PopupBias.After];
        biasY = [PopupBias.After, PopupBias.Overlap, PopupBias.Before];
      }

      const candidateX = this.placeOnSingleDimension(popupWidth, parentX, parentWidth, maxWidth, biasX);
      const candidateY = this.placeOnSingleDimension(popupHeight, parentY, parentHeight, maxHeight, biasY);

      // Reasonable defaults that can be overriden by CSS later: popups are tall, try to fit the reste
      // of the screen starting from parent element, or full screen if element if not fitting
      return ({
        width: popupWidth,
        height: popupHeight,
        left: candidateX,
        top: candidateY,
      });
    }
  }

  colorClass() {
    // if we are outside a board view, find a color used in a board to keep a bit of color everywhere
    return Utils.getCurrentBoard()?.colorClass() ?? ReactiveCache.getBoards().find(e => e.colorClass())?.colorClass();
  }
}

class PopupComponent extends BlazeComponent {
  static stack = [];
  // good enough as long as few occurences of such cases
  static nonUniqueWhitelist = ["cardDetails"];


  static refresh(popups = PopupComponent.stack) {
    // re-render a popup : too complicated to render only inner part, way safer
    // to re-render all the component and view, and destroying everything before;
    // reactivity is maintained. a list a popup to re-render can be given.
    for (const p of PopupComponent.stack.filter(e => popups.includes(e))) {
      let args = p.data();
      p.destroy();
      PopupComponent.open(args);
    }
  }
  // to provide compatibility with Popup.open().
  static open(args) {
    const openerView = Blaze.getView(args.openerElement);
    if (!openerView) {
      console.warn(`no parent found for popup ${args.name}, attaching to body: this should not happen.`);
      return;
    }


    // render ourselves; everything is automatically managed from that moment, we just added
    // a level of indirection but this will not interfere with data
    const popup = new PopupComponent();
    Blaze.renderWithData(
      popup.renderComponent(BlazeComponent.currentComponent()),
      args,
      args.openerElement,
      null,
      openerView
    );
    return popup;
  }

  static destroy(renderParent) {
    PopupComponent.stack.at(-1)?.destroy(renderParent);
  }

  static findParentPopup(element) {
    return BlazeComponent.getComponentForElement($(element).closest('.pop-over')[0]);
  }

  static draw(event) {
    const popup = PopupComponent.findParentPopup(event.target);
    popup?.draw();
    return popup;
  }

  static toFront(event) {
    const popup = PopupComponent.findParentPopup(event.target)
    popup?.toFront();
    return popup;
  }

  static toBack(event) {
    const popup = PopupComponent.findParentPopup(event.target);
    popup?.toBack();
    return popup;
  }

  static maximize(event) {
    const popup = PopupComponent.findParentPopup(event.target);
    popup?.toFront();
    popup?.maximize();
    return popup;
  }

  static minimize(event) {
    const popup = PopupComponent.findParentPopup(event.target);
    popup?.minimize();
    return popup;
  }


  getOpenerElement(view) {
    // Look for the first parent view whose first DOM element is not virtually us
    const firstNode = $(view.firstNode());

    // The goal is to have the best chances to get the element whose size and pos
    // are relevant; e.g. when clicking on a date on a minicard, we don't wan't
    // the opener to be set to the minicard.
    // In order to work in general, we need to take special situations into account,
    // e.g. the placeholder is isolated, or does not have previous node, and so on.
    // In general we prefer previous node, then next, then any displayed sibling,
    // then the parent, and so on.
    let candidates = [];
    if (!firstNode.hasClass(this.popupPlaceholderClass())) {
      candidates.push(firstNode);
    }
    candidates = candidates.concat([firstNode.prev(), firstNode.next()]);
    const otherSiblings = Array.from(firstNode.siblings()).filter(e => !candidates.includes(e));

    for (const cand of candidates.concat(otherSiblings)) {
      const displayCSS = cand?.css("display");
      if (displayCSS && displayCSS !== "none") {
        return cand[0];
      }
    }
    return this.getOpenerElement(view.parentView);
  }

  getParentData(view) {;
    let data;
    // ⚠️ node can be a text node
    while (view.firstNode?.()?.classList?.contains(this.popupPlaceholderClass())) {
      view = view.parentView;
      data = Blaze.getData(view);
    }
    // This is VERY IMPORTANT to get data like this and not with templateInstance.data,
    // because this form is reactive. So all inner popups have reactive data, which is nice
    return data;
  }

  onCreated() {
    // do not render a template with the same name and the same related data ID multiple time (also works if no ID)
    // this heuristic works in general cases; for future edge cases, add to the whitelist
    const maybeID = this.parentComponent?.()?.data?.()?._id;
    const existing = PopupComponent.stack.find((e) => (e.name === this.data().name && e.parentComponent()?.data?.()?._id === maybeID));
    if (existing && !PopupComponent.nonUniqueWhitelist.includes(existing.name)) {
      // 💡 here, we could change the behaviour. some possibilities are:
      // 1. destroy existing popup and let the current one open
      // 2. destroy new popup and
      //    a. do nothing
      //    b. force re-rendering of existing popup
      //    c. bring other popup to front (b. includes c.)
      // ...
      // for now we will just bring to front
      this.destroy();
      existing.outerComponent.toFront();
      return;
    }

    // All of this, except name, is optional. The rest is provided "just in case", for convenience (hopefully)
    //
    // - name is the name of a template to render inside the popup (to the detriment of its size) or the contrary
    // - showHeader can be turned off if the inner content always have a header with buttons and so on
    // - title is shown when header is shown
    // - miscOptions is for compatibility
    // - closeVar is an optional string representing a Session variable: if set, the popup reactively closes when the variable changes and set the variable to null on close
    // - closeDOMs can be used alternatively; it is an array of "<event> <selector>" to listen that closes the popup.
    //   if header is shown, closing the popup is already managed. selector is relative to the inner template (same as its event map)
    // - handleDOM is an element who can be clicked to move popup
    // - onDestroy is a function which will be called previous destroying with the actual inner component as `this`.
    //   it is useful when the content can be redimensionned/moved by code or user; we still manage events, resizes etc
    //   but allow inner elements or handles to do it (and we adapt).
    const data = this.data();
    this.popupArgs = {
      name: data.name,
      showHeader: data.showHeader ?? true,
      title: data.title,
      openerElement: data.openerElement,
      closeDOMs: data.closeDOMs,
      handleDOM: data.handleDOM,
      onDestroy: data.onDestroy,
      forceData: data.miscOptions?.dataContextIfCurrentDataIsUndefined || data.forceData,
      afterConfirm: data.miscOptions?.afterConfirm,
      whatsThis: data.miscOptions?.whatsThis,
      confirmArgs: data.confirmArgs,
      controlComponent: this,
    }
    this.name = this.data().name;

    this.innerTemplate = Template[this.name];
    this.innerComponentClass = BlazeComponent.getComponent(this.name);
    this.outerComponentClass = BlazeComponent.getComponent('popupDetached');
    if (!(this.innerComponentClass || this.innerTemplate)) {
      throw new Error(`template and/or component ${this.name} not found`);
    }

    // If arg is not set, must be closed manually by calling destroy()
    if (this.popupArgs.closeVar) {
      this.closeInitialValue = Session.get(this.data().closeVar);
      if (!this.closeInitialValue === undefined) {
        this.autorun(() => {
          if (Session.get(this.data().closeVar) !== this.closeInitialValue) {
            this.onDestroyed();
          }
        });
      }
    }
  }

  popupPlaceholderClass() {
    return "popup-placeholder";
  }

  render() {
    // see below for comments
    this.outerView = Blaze.renderWithData(
      // data is passed through the parent relationship
      // we need to render it again to keep events in sync with inner popup
      this.outerComponentClass.renderComponent(this.component()),
      this.popupArgs,
      document.body,
      null,
      this.openerView
    );

    const popupContentNode = this.outerView.firstNode?.()?.getElementsByClassName('content')?.[0];
    // we really want to avoid zombies popups
    if (!popupContentNode) {
      console.warn('detached popup could not render; content div not found');
      this.destroy();
    }

    this.innerView = Blaze.renderWithData(
      // the template to render: either the content is a BlazeComponent or a regular template
      // if a BlazeComponent, render it as a template first
      this.innerComponentClass?.renderComponent?.(this.component()) || this.innerTemplate,
      // dataContext used for rendering: each time we go find data, because it is non-reactive
      () => (this.popupArgs.forceData || this.getParentData(this.currentView)),
      // DOM parent: ask to the detached popup, will be inserted at the last child
      popupContentNode,
      // "stop" DOM element; we don't use
      null,
      // important: this is the Blaze.View object which will be set as `parentView` of
      // the rendered view. we set it as the parent view, so that the detached popup
      // can interact with its "parent" without being a child of it, and without
      // manipulating DOM directly.
      this.openerView
    );

    // Get concrete instances instead of classes
    this.outerComponent = BlazeComponent.getComponentForElement(this.outerView.firstNode?.());
    this.outerComponent.draw();

    // firstNode sometimes returns a text node; children return only Element.
    const candidateInnerComponent = BlazeComponent.getComponentForElement(popupContentNode.children[0]);
    // BlazeComponent will return the first component having rendered an ancestor;
    // so sometimes the inner view is a simple template and not a component; if we do
    // not take care, destroying this view will destroy e.g. parent inner...
    if (candidateInnerComponent !== BlazeComponent.getComponentForElement(this.openerView.firstNode())) {
      this.innerComponent = candidateInnerComponent;
    }
  }

  refresh() {
    PopupComponent.refresh([this]);
  }

  onRendered() {
    if (this.detached) {return}
    // Use plain Blaze stuff to be able to render all templates, but use components when available/relevant
    this.currentView = Blaze.currentView || Blaze.getView(this.component().firstNode());

    // Placement will be related to the opener (usually clicked element)
    // But template data and view related to the opener are not the same:
    // - view is probably outer, as is was already rendered on click
    // - template data could be found with Template.parentData(n), but `n` can
    //   vary depending on context: using those methods feels more reliable for this use case
    this.popupArgs.openerElement ??= this.getOpenerElement(this.currentView);
    this.openerView = Blaze.getView(this.popupArgs.openerElement);
    // With programmatic/click opening, we get the "real" opener; with dynamic
    // templating we get the placeholder and need to go up to get a glimpse of
    // the "real" opener size. It is quite imprecise in that case (maybe the
    // interesting opener is a sibling, not an ancestor), but seems to do the job
    // for now.
    // Also it feels sane that inner content does not have a reference to
    // a virtual placeholder.
    const opener = this.popupArgs.openerElement;
    let sizedOpener = opener;
    if (opener.classList?.contains?.(this.popupPlaceholderClass())) {
      sizedOpener = opener.parentNode;
    }
    this.popupArgs.nonPlaceholderOpener = sizedOpener;

    PopupComponent.stack.push(this);

    try {
      this.render();
      // Render above other popups by default
    } catch(e) {
      // If something went wrong during rendering, do not create
      // "zombie" popups
      console.error(`cannot render popup ${this.name}: ${e}`);
      this.destroy();
    }
  }

  destroy(renderParent) {
    if (this.detached) {
      // Avoid loop destroy
      return;
    }
    this.detached = true;
    this.popupArgs?.onDestroy?.call?.(this.innerComponent);
    this.observeChild?.disconnect();

    // not necesserly removed in order, e.g. multiple cards
    PopupComponent.stack = PopupComponent.stack.filter(e => e !== this);
    if (renderParent) {
      PopupComponent.refresh();
    }

    // unecessary upon "normal" conditions, but prefer destroy everything
    // in case of partial initialization
    for (const v of [this.currentView, this.outerView, this.innerView]) {
      try {
        Blaze.remove(v);
      } catch {}
    }
    this.innerComponent?.removeComponent?.();
    this.outerComponent?.removeComponent?.();
    this.removeComponent();
  }


  closeWithPlaceholder(parentElement) {
    // adapted from https://stackoverflow.com/questions/52834774/dom-event-when-element-is-removed
    // strangely, when opener is removed because of a reactive change, this component
    // do not get any lifecycle hook called, so we need to bridge the gap. Simply
    // "close" popup when placeholder is off-DOM.
    while (parentElement.nodeType === Node.TEXT_NODE) {
      parentElement = parentElement.parentElement;
    }
    const placeholder = parentElement.getElementsByClassName(this.popupPlaceholderClass());
    if (!placeholder.length) {
      return;
    }
    const observer = new MutationObserver(() => {
      // DOM element being suppressed is reflected in array
      if (placeholder.length === 0 && !this.detached) {
        this.destroy();
      }
    });
    observer.observe(parentElement, {childList: true});
  }
}

PopupComponent.register("popup");
PopupDetachedComponent.register('popupDetached');

export default PopupComponent;