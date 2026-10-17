export const setFlash = (req, type, msg) => { req.session.flash = { type, msg }; };
export function flashMw(req, res, next) {
  res.locals.flash = req.session.flash;
  delete req.session.flash;
  next();
}
