import {
  Alert,
  Box,
  Button,
  Stack,
  Tab,
  Tabs,
  TextField,
  Typography,
  useTheme,
  List,
  ListItem,
  ListItemText,
  Chip,
} from "@mui/material";
import { useEffect, useState } from "react";
import { Navigate } from "react-router-dom";
import { useSelector } from "../../redux/store";
import { selectAuthUser } from "../../redux/selectors/authSelectors";
import { getAdminService } from "../../services/serviceRegistry";
import type {
  AdminAuditLog,
  AdminReport,
  AdminUser,
} from "../../services/adminService";

type AdminTab = "users" | "reports" | "audit";

const AdminPage = () => {
  const theme = useTheme();
  const user = useSelector(selectAuthUser);
  const [tab, setTab] = useState<AdminTab>("users");
  const [q, setQ] = useState("");
  const [users, setUsers] = useState<AdminUser[]>([]);
  const [reports, setReports] = useState<AdminReport[]>([]);
  const [audit, setAudit] = useState<AdminAuditLog[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const isAdmin =
    user?.globalRole === "ADMIN" || user?.globalRole === "SUPER_ADMIN";

  useEffect(() => {
    if (!isAdmin) return;
    let cancelled = false;
    const load = async () => {
      setLoading(true);
      setError(null);
      try {
        const admin = getAdminService();
        if (tab === "users") {
          const page = await admin.listUsers({ limit: 50 });
          if (!cancelled) setUsers(page.results);
        } else if (tab === "reports") {
          const page = await admin.listReports({ limit: 50 });
          if (!cancelled) setReports(page.results);
        } else {
          const page = await admin.listAudit({ limit: 50 });
          if (!cancelled) setAudit(page.results);
        }
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : "Failed to load");
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    };
    void load();
    return () => {
      cancelled = true;
    };
  }, [isAdmin, tab]);

  if (!isAdmin) {
    return <Navigate to="/app" replace />;
  }

  return (
    <Stack direction="row" sx={{ width: "100%" }}>
      <Box
        sx={{
          height: "100vh",
          width: "100%",
          maxWidth: 960,
          backgroundColor:
            theme.palette.mode === "light"
              ? "#F8FAFF"
              : theme.palette.background.paper,
          p: 3,
        }}
      >
        <Stack spacing={2} sx={{ height: "100%" }}>
          <Typography variant="h5">Admin</Typography>
          <Tabs
            value={tab}
            onChange={(_, value: AdminTab) => setTab(value)}
          >
            <Tab value="users" label="Users" />
            <Tab value="reports" label="Reports" />
            <Tab value="audit" label="Audit" />
          </Tabs>

          {tab === "users" && (
            <TextField
              size="small"
              placeholder="Filter users"
              value={q}
              onChange={(e) => setQ(e.target.value)}
              aria-label="Filter admin users"
            />
          )}

          {error && <Alert severity="error">{error}</Alert>}
          {loading && (
            <Typography variant="body2" color="text.secondary">
              Loading…
            </Typography>
          )}

          <Box sx={{ overflowY: "auto", flex: 1 }}>
            {tab === "users" && (
              <List>
                {users
                  .filter((u) => {
                    if (!q.trim()) return true;
                    const needle = q.trim().toLowerCase();
                    return (
                      u.name.toLowerCase().includes(needle) ||
                      u.email.toLowerCase().includes(needle)
                    );
                  })
                  .map((u) => (
                  <ListItem
                    key={u.id}
                    secondaryAction={
                      <Stack direction="row" spacing={1}>
                        {u.suspendedAt ? (
                          <Button
                            size="small"
                            onClick={() =>
                              void getAdminService()
                                .unsuspendUser(u.id)
                                .then((updated) =>
                                  setUsers((prev) =>
                                    prev.map((row) =>
                                      row.id === updated.id ? updated : row
                                    )
                                  )
                                )
                            }
                          >
                            Unsuspend
                          </Button>
                        ) : (
                          <Button
                            size="small"
                            color="warning"
                            onClick={() =>
                              void getAdminService()
                                .suspendUser(u.id)
                                .then((updated) =>
                                  setUsers((prev) =>
                                    prev.map((row) =>
                                      row.id === updated.id ? updated : row
                                    )
                                  )
                                )
                            }
                          >
                            Suspend
                          </Button>
                        )}
                        <Button
                          size="small"
                          onClick={() =>
                            void getAdminService().logoutAll(u.id)
                          }
                        >
                          Logout all
                        </Button>
                      </Stack>
                    }
                  >
                    <ListItemText
                      primary={
                        <Stack direction="row" spacing={1} alignItems="center">
                          <span>{u.name}</span>
                          <Chip size="small" label={u.globalRole} />
                          {u.suspendedAt && (
                            <Chip size="small" color="warning" label="Suspended" />
                          )}
                          {u.deletedAt && (
                            <Chip size="small" color="error" label="Deleted" />
                          )}
                        </Stack>
                      }
                      secondary={u.email}
                    />
                  </ListItem>
                ))}
              </List>
            )}

            {tab === "reports" && (
              <List>
                {reports.map((r) => (
                  <ListItem
                    key={r.id}
                    secondaryAction={
                      <Stack direction="row" spacing={1}>
                        {r.status === "OPEN" && (
                          <Button
                            size="small"
                            onClick={() =>
                              void getAdminService()
                                .reviewReport(r.id)
                                .then((updated) =>
                                  setReports((prev) =>
                                    prev.map((row) =>
                                      row.id === updated.id ? updated : row
                                    )
                                  )
                                )
                            }
                          >
                            Review
                          </Button>
                        )}
                        <Button
                          size="small"
                          color="success"
                          onClick={() =>
                            void getAdminService()
                              .resolveReport(r.id, "Resolved by admin")
                              .then((updated) =>
                                setReports((prev) =>
                                  prev.map((row) =>
                                    row.id === updated.id ? updated : row
                                  )
                                )
                              )
                          }
                        >
                          Resolve
                        </Button>
                        <Button
                          size="small"
                          color="inherit"
                          onClick={() =>
                            void getAdminService()
                              .dismissReport(r.id)
                              .then((updated) =>
                                setReports((prev) =>
                                  prev.map((row) =>
                                    row.id === updated.id ? updated : row
                                  )
                                )
                              )
                          }
                        >
                          Dismiss
                        </Button>
                      </Stack>
                    }
                  >
                    <ListItemText
                      primary={`${r.targetType} · ${r.reason}`}
                      secondary={`${r.status} · ${r.targetId}`}
                    />
                  </ListItem>
                ))}
              </List>
            )}

            {tab === "audit" && (
              <List>
                {audit.map((entry) => (
                  <ListItem key={entry.id}>
                    <ListItemText
                      primary={entry.action}
                      secondary={`${entry.entityType}${
                        entry.entityId ? `:${entry.entityId}` : ""
                      } · ${new Date(entry.createdAt).toLocaleString()}`}
                    />
                  </ListItem>
                ))}
              </List>
            )}
          </Box>
        </Stack>
      </Box>
    </Stack>
  );
};

export default AdminPage;
