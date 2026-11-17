export function requireLogin(req, res, next) {
    if (req.session?.user?.username) return next();
    return res.status(401).json({ success: false, error: "请先登录" });
}

export function requireAdmin(req, res, next) {
    if (req.session?.user?.role === "admin") return next();
    return res.status(403).json({ success: false, error: "需要管理员权限" });
}
