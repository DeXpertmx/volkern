import('./components/webcreator/templates/data/landing-page/autopilot.json', { with: { type: "json" } })
  .then(m => {
    console.log("m:", Object.keys(m));
    console.log("m.default:", m.default ? Object.keys(m.default) : "undefined");
  })
  .catch(err => console.error(err));
