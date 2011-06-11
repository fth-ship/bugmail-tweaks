if (!this.bugmail) { this.bugmail = {}; }
if (!this.bugmail.bzmail) {

  var bug_info_cache = {};

  var bz = "https://bugzilla.mozilla.org/";

  function replacer (pattern, replacement) {
    return function(html, obj) {
      pattern = new RegExp(pattern.source, "gm");
      return html.replace(pattern, replacement);
    }
  };

  function is_bugmail(html) {
      return html.match(this.recognizer) != null;
  };

  function bug_info(num) {
    $.ajax({
      url: 'https://api-dev.bugzilla.mozilla.org/latest/bug/' + num + '?include_fields=summary,status',
      accepts: "application/json",
      cache: true,
      contents: "application/json",
      crossDomain: true,
      error: function() { console.log("api error"); },
      success: function() { console.log("success"); },
    });
  };

  function bug (num, str) {
    if (!str) { str = num; }

    return '<a href="' + bz + 'show_bug.cgi?id=' + num + '" target="_blank">' + str + '</a>';
  };



  var rblocks = replacer(/Blocks: (\d+)/,
                         'Blocks: ' + bug('$1'));

  var rbug = replacer(/([bB]ug:?\s*)(\d+)/,
                      bug('$2', '$1$2'));

  // Rewrite bugs in the final column of a table
  var rtablebug1 = replacer(/\|(\d+)\n/,
                            '|' + bug('$1') + '\n');

  var rtablebug2 = replacer(/\|(\d+), (\d+)\n/,
                            '|' + bug('$1') + ', ' + bug('$2') + '\n');

  var rtablebug3 = replacer(/\|(\d+), (\d+), (\d+)([,\n])/,
                            '|' + bug('$1') + ', ' + bug('$2') + ', ' + bug('$3') + '$4');

  // Rewrite bugs in the middle column of a table
  var rtablebug4 = replacer(/\|(\d+)(\s+|)/,
                            '|' + bug('$1') + '$2');

  var rtablebug5 = replacer(/\|(\d+), (\d+)(\s+|)n/,
                            '|' + bug('$1') + ', ' + bug('$2') + '$3');

  var rtablebug6 = replacer(/\|(\d+), (\d+), (\d+)([,\s]|)/,
                            '|' + bug('$1') + ', ' + bug('$2') + ', ' + bug('$3') + '$4');


  function monospacer(html, obj) {
    // Parse a bugzilla block and wrap pre tags around it. eg:
    //    What    |Removed                     |Added
    //    ----------------------------------------------------------------------------
    //    Summary |Add trychooser syntax for   |Add trychooser syntax for
    //            |SM builds                   |Spidermonkey builds


    // The HTML gmail generates around this can be quite changable, so be
    // robust. We match on HEADER+BARS+ROWS*. We stop when there is a newline
    // with no '&nbsp;'s (not too hard since '.' doesn't match newlines in JS).

    var header1 = /( &nbsp;){5} What( &nbsp;){2}\|Old Value( &nbsp;){9} \|New Value/;
    var header2 = /( &nbsp;){5} What( &nbsp;){2}\|Removed( &nbsp;){10} \|Added/;
    var bars = /(-*<wbr>){2}-*/;
    var row = /.*nbsp.*/;


    // A simple line parser. When we see a header we open a PRE tag, and we
    // close it again once we no longer match a row.
 
    result = "";
    var started = false;
    var readd_div = false;

    lines = html.split(/<br>\n/);
    for (var i in lines) {
      var line = lines[i];

      if (line.match(header1) || line.match(header2)) {
        // heading
        started = true;
        result += '<pre>' + line + '\n';
      } else if (started) {
        if (line.match(bars) || line.match(row)) {
          // rows
          
          // Special case: sometimes gmail closes a <div> in the middle of the
          // table, which closes the pre. I don't like special-casing this, but
          // the nicer way (wrapping each line in a <pre>) doesn't really fix
          // the problem without a hack of it's own, and also leads to bad spacing.
          if (line.match(/<\/div>/)) {
            readd_div = true;
            line = line.replace(/<\/div>/, '');
          }

          result += line + '\n';

          // spacial case
        } else {
          // Finished
          if (readd_div) {
            result += '</pre></div>\n' + line;
          } else {
            result += '</pre>\n' + line;
          }
          started = false;

        }
      } else {
        // Unrelated
        result += line + '<br>\n';
      }
    }

    return result;
  }

  function commentify(html, obj) {
    if (!obj)
      return html;

    return html.replace(later.recognizer, '$&#c' + obj.comment_num);
  }

  
  // FIXME:
  //    This could actually be any comment or change (not just comment 0) if
  //    the subject of the bug is changed.
  var first = {
    name: 'first mail',
    recognizer: '^<div id=":\\w+"><a href="https://bugzilla.mozilla.org/show_bug.cgi\\?id=\\d+',
    matches: is_bugmail,
    replacers: [rblocks, rbug, monospacer, rtablebug1, rtablebug2, rtablebug3, rtablebug4, rtablebug5, rtablebug6, commentify],
  };

  var later = {
    name: 'later mail',
    recognizer: '^<div id=":\\w+"><div class="im"><a href="https://bugzilla.mozilla.org/show_bug.cgi\\?id=\\d+',
    matches: is_bugmail,
    replacers: [rblocks, rbug, monospacer, rtablebug1, rtablebug2, rtablebug3, rtablebug4, rtablebug5, rtablebug6, commentify],

    parser:
      function(html) {

        // Regexs that, concated together, parse bug information out of the gmail's HTML
        var start = '^<div id=":\\w+"><div class="im"><a href="https://bugzilla.mozilla.org/';
        var bugnum = 'show_bug.cgi\\?id=(\\d+)';
        var comment_num = '[\s\S]+--- Comment #(\\d+)';
        var author = ' from ([^\\(]+)';
        var username = '.\\((:[^\\)]+)\\)';
        var date = '[\s\S]+(\\d{4}-\\d{2}-\\d{2} \\d{2}:\\d{2}:\\d{2} PDT) ---'

          // Read the data first.
        var re = start + bugnum + comment_num + author + username + date;
        return html.match(re, 'm');
      }
  };

  var bugmails = [first, later];

  function tweak (msg) {
    console.log("tweaking");
    var html = msg.innerHTML;

    for (var i in bugmails) {
      b = bugmails[i];
      if (b.matches(html)) {
        console.log("Matches: " + b.name);
        console.log("old: " + html);
        obj = b.parser ? b.parser(html) : null;
        for (r in b.replacers) {
          old = html;
          html = b.replacers[r](html, obj);
        }

        if (old != html) {
          console.log("new: " + html);
        }

        msg.innerHTML = html;

        if (b.updateHtml) b.updateHtml(msg, obj);

        // Don't run multiple parsers over it, handle that use case by inheritence.
        return;
      }
    }

    console.log("not bugmail");
  }

  this.bugmail.bzmail = {translate: tweak};

};
