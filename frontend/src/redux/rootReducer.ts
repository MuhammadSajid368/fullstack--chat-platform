import { combineReducers } from "redux";
import appReducer from "./slices/appSlice";
import authReducer from "./slices/authSlice";
import chatReducer from "./slices/chatSlice";
import notificationReducer from "./slices/notificationSlice";
import presenceReducer from "./slices/presenceSlice";
import searchReducer from "./slices/searchSlice";

const rootReducer = combineReducers({
  app: appReducer,
  auth: authReducer,
  chat: chatReducer,
  notifications: notificationReducer,
  presence: presenceReducer,
  search: searchReducer,
});

export type RootReducerState = ReturnType<typeof rootReducer>;

export { rootReducer };
