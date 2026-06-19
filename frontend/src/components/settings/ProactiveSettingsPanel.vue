<script setup lang="ts">
import { AlarmPlus, ChevronDown, ChevronUp, Sparkles, Trash2, X } from "@lucide/vue";
import type { ProactiveConfig, ProactiveEvent, Reminder } from "@/api/engagement";
import InlineProbe from "@/components/layout/InlineProbe.vue";

type ProbeStatus = "idle" | "running" | "ok" | "failed" | "warning";

interface ProbeView {
  status: ProbeStatus;
  text: string;
  detail: string;
}

interface EngagementView {
  config: ProactiveConfig;
  reminderTitle: string;
  reminderDueAt: string;
  reminderChannel: string;
}

defineProps<{
  engagement: EngagementView;
  probe: ProbeView;
  pendingReminders: Reminder[];
  recentEvents: ProactiveEvent[];
  visibleRecentEvents: ProactiveEvent[];
  hiddenRecentEventCount: number;
  eventsExpanded: boolean;
  formatTime: (value?: string) => string;
}>();

const emit = defineEmits<{
  runProbe: [];
  copyProbe: [];
  createReminder: [];
  removeReminder: [reminderId: string, title?: string];
  toggleEventsExpanded: [];
  clearVisibleEvents: [];
  dismissEvent: [eventId: string];
  deleteEvent: [eventId: string, title?: string];
}>();
</script>

<template>
  <article class="settings-panel proactive-panel settings-section-detached is-active is-current" id="proactive">
    <div class="panel-head">
      <div>
        <p class="eyebrow">主动</p>
        <h2>主动性</h2>
      </div>
      <span class="soft-badge">{{ engagement.config.enabled ? "主动消息已启用" : "主动消息关闭" }}</span>
    </div>
    <div class="proactive-layout">
      <section class="proactive-card">
        <div class="appearance-card-head"><strong>全局策略</strong><small>问候、追问、提醒共用</small></div>
        <div class="form-grid compact">
          <label><span>主动性总开关</span><select v-model="engagement.config.enabled"><option :value="true">启用</option><option :value="false">关闭</option></select></label>
          <label><span>每日上限</span><input v-model.number="engagement.config.daily_limit" type="number" min="0" max="30" step="1" /></label>
          <label><span>语气</span><select v-model="engagement.config.tone"><option value="warm">温和</option><option value="concise">简洁</option><option value="playful">轻快</option></select></label>
          <label><span>追问强度</span><select v-model="engagement.config.followup_level"><option value="off">关闭</option><option value="restrained">克制</option><option value="standard">标准</option><option value="active">积极</option></select></label>
        </div>
        <div class="toggle-row">
          <label><input v-model="engagement.config.ask_followup_enabled" type="checkbox" />缺信息时主动追问</label>
          <label><input v-model="engagement.config.channels.web" type="checkbox" />Web 通道</label>
          <label><input v-model="engagement.config.channels.weixin" type="checkbox" />微信通道</label>
        </div>
        <div class="greeting-time-range">
          <label><input v-model="engagement.config.quiet_hours_enabled" type="checkbox" />免打扰</label>
          <span>开始</span><input v-model="engagement.config.quiet_start" type="time" />
          <span>结束</span><input v-model="engagement.config.quiet_end" type="time" />
        </div>
      </section>

      <section class="proactive-card">
        <div class="appearance-card-head"><strong>问候场景</strong><small>窗口内只会生成一次</small></div>
        <div class="greeting-switches">
          <label><input v-model="engagement.config.greetings.enabled" type="checkbox" />启用问候</label>
          <label><input v-model="engagement.config.greetings.good_morning.enabled" type="checkbox" />早安</label>
          <label><input v-model="engagement.config.greetings.noon.enabled" type="checkbox" />午间</label>
          <label><input v-model="engagement.config.greetings.good_night.enabled" type="checkbox" />晚安</label>
          <label><input v-model="engagement.config.greetings.long_absence.enabled" type="checkbox" />久未互动</label>
        </div>
        <div class="form-grid compact">
          <label><span>早安开始</span><input v-model="engagement.config.greetings.good_morning.window_start" type="time" /></label>
          <label><span>早安结束</span><input v-model="engagement.config.greetings.good_morning.window_end" type="time" /></label>
          <label><span>午间开始</span><input v-model="engagement.config.greetings.noon.window_start" type="time" /></label>
          <label><span>午间结束</span><input v-model="engagement.config.greetings.noon.window_end" type="time" /></label>
          <label><span>晚安开始</span><input v-model="engagement.config.greetings.good_night.window_start" type="time" /></label>
          <label><span>晚安结束</span><input v-model="engagement.config.greetings.good_night.window_end" type="time" /></label>
          <label><span>久未互动小时</span><input v-model.number="engagement.config.greetings.long_absence.after_hours" type="number" min="1" max="720" step="1" /></label>
        </div>
        <div class="greeting-options">
          <label><input v-model="engagement.config.greetings.good_morning.with_weather" type="checkbox" />早安带天气</label>
          <label><input v-model="engagement.config.greetings.good_morning.with_reminders" type="checkbox" />早安带提醒</label>
          <label><input v-model="engagement.config.greetings.noon.with_reminders" type="checkbox" />午间带提醒</label>
        </div>
      </section>

      <section class="proactive-card">
        <div class="appearance-card-head"><strong>触发器</strong><small>控制后台主动事件来源</small></div>
        <div class="toggle-row">
          <label><input v-model="engagement.config.triggers.reminders" type="checkbox" />定时提醒</label>
          <label><input v-model="engagement.config.triggers.service_alerts" type="checkbox" />服务告警</label>
          <label><input v-model="engagement.config.triggers.weather" type="checkbox" />天气</label>
          <label><input v-model="engagement.config.triggers.news_watch" type="checkbox" />新闻观察</label>
          <label><input v-model="engagement.config.triggers.emotion_care" type="checkbox" />情绪关怀</label>
          <label><input v-model="engagement.config.triggers.long_goal_followup" type="checkbox" />长期目标追踪</label>
        </div>
        <div class="settings-diagnostics-callout compact">
          <span>主动消息最小回路</span>
          <button class="secondary-action" type="button" @click="emit('runProbe')"><Sparkles :size="15" />生成测试</button>
        </div>
        <InlineProbe
          variant="compact"
          title="主动消息测试"
          summary="按当前主动性通道生成一条测试事件，检查调度和发送结果。"
          :status="probe.status"
          :status-text="probe.text"
          :detail="probe.detail"
          action-text="运行"
          @run="emit('runProbe')"
          @copy="emit('copyProbe')"
        />
      </section>

      <section class="proactive-card">
        <div class="appearance-card-head"><strong>定时提醒</strong><small>{{ pendingReminders.length }} 条待触发</small></div>
        <div class="reminder-editor">
          <input v-model="engagement.reminderTitle" placeholder="提醒内容" />
          <input v-model="engagement.reminderDueAt" type="datetime-local" />
          <select v-model="engagement.reminderChannel">
            <option value="web">Web</option>
            <option value="weixin">微信</option>
          </select>
          <button class="primary-action" type="button" @click="emit('createReminder')"><AlarmPlus :size="15" />添加</button>
        </div>
        <div class="reminder-list">
          <article v-for="reminder in pendingReminders" :key="reminder.id" class="reminder-item">
            <div>
              <strong>{{ reminder.title }}</strong>
              <small>{{ formatTime(reminder.due_at) }} · {{ reminder.channel || "web" }}</small>
            </div>
            <button class="icon-button" type="button" title="删除提醒" @click="emit('removeReminder', reminder.id, reminder.title)"><Trash2 :size="15" /></button>
          </article>
          <div v-if="!pendingReminders.length" class="model-file-empty">暂无待触发提醒</div>
        </div>
      </section>

      <section class="proactive-card">
        <div class="appearance-card-head">
          <div><strong>最近事件</strong><small>主动消息和微信通道发送记录</small></div>
          <div class="inline-actions">
            <button class="secondary-action" type="button" :disabled="!recentEvents.length" @click="emit('toggleEventsExpanded')">
              <component :is="eventsExpanded ? ChevronUp : ChevronDown" :size="15" />
              {{ eventsExpanded ? "收起" : `展开 ${hiddenRecentEventCount || ""}` }}
            </button>
            <button class="secondary-action danger" type="button" :disabled="!visibleRecentEvents.length" @click="emit('clearVisibleEvents')">
              <Trash2 :size="15" />清理显示项
            </button>
          </div>
        </div>
        <div class="proactive-events">
          <article v-for="event in visibleRecentEvents" :key="event.id" class="proactive-event" :class="event.status">
            <div>
              <strong>{{ event.title || event.kind || "主动事件" }}</strong>
              <span>{{ event.content || event.last_error || "--" }}</span>
              <small>{{ formatTime(event.created_at) }} · {{ event.channel || "web" }} · {{ event.status || "pending" }}</small>
            </div>
            <div class="event-actions">
              <button class="icon-button" type="button" title="忽略事件" @click="emit('dismissEvent', event.id)"><X :size="15" /></button>
              <button class="icon-button danger" type="button" title="删除事件" @click="emit('deleteEvent', event.id, event.title || event.kind)"><Trash2 :size="15" /></button>
            </div>
          </article>
          <div v-if="hiddenRecentEventCount" class="model-file-empty">还有 {{ hiddenRecentEventCount }} 条，点击展开查看。</div>
          <div v-if="!recentEvents.length" class="model-file-empty">暂无主动事件</div>
        </div>
      </section>
    </div>
  </article>
</template>
