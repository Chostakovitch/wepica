import PopupComponent from '/client/components/main/popup';
import { TAPi18n } from '/imports/i18n';

window.Popup = new (class {
  stack() {
    return PopupComponent.stack;
  }
  /// This function returns a callback that can be used in an event map:
  ///   Template.tplName.events({
  ///     'click .elementClass': Popup.open("popupName"),
  ///   });
  /// The popup inherit the data context of its parent.
  open(name, args, suffix = 'Popup') {
    const self = this;
    return function(evt, options) {
      const popupName = `${name}${suffix}`;
      const openerElement = evt.target;
      let classicArgs = { openerElement: openerElement, name: popupName, title: self._getTitle(popupName), miscOptions: options };
      if (typeof(args) === "object") {
        classicArgs = Object.assign(classicArgs, args);
      }
      PopupComponent.open(classicArgs);
      evt.preventDefault();
      // important so that one click does not opens multiple, stacked popups
      evt.stopPropagation();
    };
  }

  /// This function returns a callback that can be used in an event map:
  ///   Template.tplName.events({
  ///     'click .elementClass': Popup.afterConfirm("popupName", function() {
  ///       // What to do after the user has confirmed the action
  ///     }),
  ///   });
  afterConfirm(name, action, whatsThis, popupArgs) {
    const self = this;
    return function(evt, tpl) {
      tpl ??= {};
      tpl.afterConfirm = action;
      tpl.whatsThis = whatsThis;
      // Just a wrapper of open which will call `action` on some events
      // see PopupDetachedComponent; for now this is hardcoded
      self.open(name, popupArgs)(evt, tpl);
      evt.preventDefault();
    };
  }

  // renderParent can be used in very special situations where "parent
  // popup", loosely defined as the top of the stack, must be redrawn
  // entirely after closing n popups. This should rather indicate
  // something abnormal in the code that a standard behaviour and
  // will cause a flicker.
  back(n = 1, renderParent = false) {
    _.times(n, () => PopupComponent.destroy(renderParent));
  }

  /// Close the current opened popup.
  close() {
    this.back();
  }

  closeAll() {
    this.back(PopupComponent.stack.length)
  }


  getOpenerComponent(n=4) {
    const { openerElement } = Template.parentData(n);
    return BlazeComponent.getComponentForElement(openerElement);
  }

  // We get the title from the translation files. Instead of returning the
  // result, we return a function that compute the result and since `TAPi18n.__`
  // is a reactive data source, the title will be changed reactively.
  _getTitle(popupName) {
    return () => {
      const translationKey = `${popupName}-title`;

      // XXX There is no public API to check if there is an available
      // translation for a given key. So we try to translate the key and if the
      // translation output equals the key input we deduce that no translation
      // was available and returns `false`. There is a (small) risk a false
      // positives.
      const title = TAPi18n.__(translationKey);
      // when popup showed as full of small screen, we need a default header to clearly see [X] button
      const defaultTitle = Utils.isMiniScreen() ? '' : false;
      return title !== translationKey ? title : defaultTitle;
    };
  }
})();

// We close a potential opened popup on any left click on the document, or go
// one step back by pressing escape.
const escapeActions = ['back', 'close'];
escapeActions.forEach(actionName => {
  EscapeActions.register(
    `popup-${actionName}`,
    () => Popup[actionName](),
    () => PopupComponent.stack.length > 0,
    {
      // will maybe need something more robust, but for now it enables multiple cards opened without closing each other when clicking on common UI elements
      noClickEscapeOn: '.js-pop-over,.js-open-card-title-popup,.js-open-inlined-form,.textcomplete-dropdown,.js-card-details,.board-sidebar,#header,.add-comment-reaction',
      enabledOnClick: actionName === 'close',
    },
  );
});