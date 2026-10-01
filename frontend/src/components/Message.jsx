// Message.jsx
// Shows a green success box or a red error box.
// If there is no text, it shows nothing.

function Message({ type, text }) {
  if (!text) {
    return null;
  }
  // type is "success" or "error". It picks the CSS class (colour).
  return <p className={'message ' + type}>{text}</p>;
}

export default Message;
