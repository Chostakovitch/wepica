// We use @textcomplete packages to integrate with our EscapeActions system.
// You should always use `createEscapeableTextComplete` or the jQuery extension
// `escapeableTextComplete` instead of the vanilla textcomplete.
import { Textcomplete } from '@textcomplete/core';
import { Editor } from '@textcomplete/core';
import { TextareaEditor } from '@textcomplete/textarea';
import { ContenteditableEditor } from '@textcomplete/contenteditable';

let dropdownMenuIsOpened = false;

/**
 * Create an escapeable textcomplete instance for a textarea or contenteditable element
 * @param {HTMLTextAreaElement|HTMLElement} element - The target element
 * @param {Array} strategies - Array of strategy objects
 * @param {Object} options - Additional options
 * @returns {Textcomplete} The textcomplete instance
 */
export function createEscapeableTextComplete(element, strategies, options = {}, largerDOMListener = null) {
  // Determine the appropriate editor based on element type
  const isContentEditable = element.isContentEditable || element.contentEditable === 'true';
  const EditorClass = isContentEditable ? ContenteditableEditor : TextareaEditor;
  // Monkeypatch this library so tab is not interpreted as "Enter"
  const editor = new EditorClass(element);
  editor.getCode = (e) => {
    switch (e.keyCode) {
      case 13: // enter
        return "ENTER";
      case 27: // esc
        return "ESC";
      case 38: // up
        return "UP";
      // instead interpret as down
      case 9: //tab
      case 40: // down
        return "DOWN";
      case 78: // ctrl-n
        if (e.ctrlKey)
          return "DOWN";
        break;
      case 80: // ctrl-p
        if (e.ctrlKey)
          return "UP";
        break;
    }
    return "OTHER";
  }

  // Merge default options
  const mergedOptions = {
    dropdown: {
      className: 'textcomplete-dropdown',
      maxCount: 10,
      placement: 'bottom',
      ...options.dropdown,
    },
  };

  const textcomplete = new Textcomplete(editor, strategies, mergedOptions);

  // When the autocomplete menu is shown we want both a press of both `Tab`
  // or `Enter` to validate the auto-completion. We also need to stop the
  // event propagation to prevent EscapeActions side effect, for instance the
  // minicard submission (on `Enter`) or going on the next column (on `Tab`).
  (largerDOMListener ?? element).addEventListener('keydown', (evt) => {
    if (dropdownMenuIsOpened && (evt.keyCode === 9 || evt.keyCode === 13)) {
      if (evt.keyCode === 9) {
        const curr = $('.textcomplete-item.active');
        let mod = curr.next('.textcomplete-item');
        if (!mod.length) {
          mod = curr.siblings('.textcomplete-item').first();
          curr.removeClass('active')
          mod.addClass('active');
        }
        evt.stopPropagation();
      }
    }
  });

  // Track dropdown state for EscapeActions integration
  // Since @textcomplete automatically closes when Escape is pressed, we
  // integrate with our EscapeActions system by tracking open/close state.
  textcomplete.on('show', () => {
    dropdownMenuIsOpened = true;
  });

  textcomplete.on('selected', () => {
    EscapeActions.preventNextClick();
  });

  textcomplete.on('hidden', () => {
    Tracker.afterFlush(() => {
      // XXX Hack. We unfortunately need to set a setTimeout here to make the
      // `noClickEscapeOn` work below, otherwise clicking on a autocomplete
      // item will close both the autocomplete menu (as expected) but also the
      // next item in the stack (for example the minicard editor) which we
      // don't want.
      setTimeout(() => {
        dropdownMenuIsOpened = false;
      }, 100);
    });
  });

  return textcomplete;
}

// jQuery extension for backward compatibility
$.fn.escapeableTextComplete = function(strategies, options = {}, largerDOMListener = null) {
  return this.each(function() {
    createEscapeableTextComplete(this, strategies, options, largerDOMListener);
  });
};

EscapeActions.register(
  'textcomplete',
  () => {},
  () => dropdownMenuIsOpened,
  {
    noClickEscapeOn: '.textcomplete-dropdown',
  },
);
