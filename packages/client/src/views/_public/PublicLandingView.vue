<template>
  <div class="public-landing">
    <section class="public-hero" aria-labelledby="public-hero-title">
      <div class="public-hero__copy">
        <p class="public-eyebrow"><span aria-hidden="true" /> شبکهٔ همراهی و امداد محلی</p>
        <h1 id="public-hero-title">وقتی کنار هم باشیم،<br /><em>راهِ کمک نزدیک‌تر است.</em></h1>
        <p class="public-hero__lead">
          بوروبیا جایی برای ارتباط با همراهان مورد اعتماد و درخواست کمک در زمان نیاز است؛
          با اختیار شما، نه با اشتراک خودکار موقعیت.
        </p>
        <div class="public-hero__actions">
          <RouterLink class="public-button public-button--primary" to="/_auth/register">
            شروع همراهی <v-icon icon="mdi-arrow-left" size="21" aria-hidden="true" />
          </RouterLink>
          <RouterLink class="public-button public-button--outline" to="/_auth/login">حساب دارم؛ ورود</RouterLink>
        </div>
        <p class="public-hero__assurance"><v-icon icon="mdi-shield-check-outline" size="19" aria-hidden="true" /> موقعیت شما تنها با انتخاب خودتان به اشتراک گذاشته می‌شود.</p>
      </div>

      <div class="public-network" aria-hidden="true">
        <span class="public-network__grid" />
        <span class="public-network__orbit public-network__orbit--outer" />
        <span class="public-network__orbit public-network__orbit--inner" />
        <span class="public-network__path public-network__path--one" />
        <span class="public-network__path public-network__path--two" />
        <span class="public-network__path public-network__path--three" />
        <span class="public-network__core"><v-icon icon="mdi-plus" size="56" /></span>
        <span class="public-network__node public-network__node--one"><v-icon icon="mdi-account-heart-outline" size="24" /></span>
        <span class="public-network__node public-network__node--two"><v-icon icon="mdi-map-marker-outline" size="24" /></span>
        <span class="public-network__node public-network__node--three"><v-icon icon="mdi-lifebuoy" size="24" /></span>
        <span class="public-network__tag public-network__tag--top"><v-icon icon="mdi-lock-outline" size="17" /> اشتراک انتخابی</span>
        <span class="public-network__tag public-network__tag--bottom"><v-icon icon="mdi-account-group-outline" size="17" /> همراهان مورد اعتماد</span>
      </div>
    </section>

    <section class="public-section" aria-labelledby="public-values-title">
      <div class="public-section__heading">
        <p class="public-section__eyebrow">چرا بوروبیا؟</p>
        <h2 id="public-values-title">برای لحظه‌هایی که همراهی مهم است.</h2>
        <p>ابزارهای روشن و در دسترس، بدون اینکه اختیار موقعیت‌تان را از شما بگیرند.</p>
      </div>
      <div class="public-values">
        <article class="public-value">
          <span class="public-value__icon"><v-icon icon="mdi-shield-lock-outline" size="27" /></span>
          <span class="public-value__number" aria-hidden="true">۰۱</span>
          <h3>اختیار با شماست</h3>
          <p>زمان شروع و توقف پخش موقعیت را خودتان تعیین می‌کنید و همراهان مجازتان را انتخاب می‌کنید.</p>
        </article>
        <article class="public-value">
          <span class="public-value__icon"><v-icon icon="mdi-account-multiple-outline" size="27" /></span>
          <span class="public-value__number" aria-hidden="true">۰۲</span>
          <h3>نزدیکِ همراهان</h3>
          <p>موقعیت همراهانی را که با شما اشتراک گذاشته‌اند، در نقشه ببینید و به‌راحتی پیدایشان کنید.</p>
        </article>
        <article class="public-value">
          <span class="public-value__icon"><v-icon icon="mdi-lifebuoy" size="27" /></span>
          <span class="public-value__number" aria-hidden="true">۰۳</span>
          <h3>راهی برای درخواست کمک</h3>
          <p>در زمان نیاز، درخواست امداد را با جزئیات موقعیت ثبت کنید تا در شبکهٔ محلی بررسی شود.</p>
        </article>
      </div>
    </section>

    <section class="public-steps" aria-labelledby="public-steps-title">
      <div class="public-steps__intro">
        <p class="public-section__eyebrow">شروع ساده</p>
        <h2 id="public-steps-title">سه قدم تا<br />همراهیِ مطمئن‌تر.</h2>
        <p>برای استفاده از امکانات، به حساب کاربری و دسترسی به سرور محلی بوروبیا نیاز دارید.</p>
        <RouterLink class="public-text-link" to="/_auth/register">ساخت حساب <v-icon icon="mdi-arrow-left" size="19" aria-hidden="true" /></RouterLink>
      </div>
      <ol class="public-steps__list">
        <li><span>۱</span><div><h3>حساب خود را بسازید</h3><p>با پرسش‌های امنیتی، امکان بازیابی حساب‌تان را نیز فراهم کنید.</p></div></li>
        <li><span>۲</span><div><h3>همراهان‌تان را انتخاب کنید</h3><p>اشتراک را فقط برای افرادی که به آن‌ها اعتماد دارید فعال کنید.</p></div></li>
        <li><span>۳</span><div><h3>هر وقت لازم شد، اقدام کنید</h3><p>از نقشه، موقعیت زنده یا درخواست امداد را با انتخاب خودتان آغاز کنید.</p></div></li>
      </ol>
    </section>

    <section class="public-final" aria-labelledby="public-final-title">
      <div><p class="public-section__eyebrow">از همین‌جا</p><h2 id="public-final-title">با هم، آماده‌تر باشیم.</h2><p>برای شروع، یک حساب بسازید یا به حساب خود برگردید.</p></div>
      <RouterLink class="public-button public-button--primary" to="/_auth/register">ساخت حساب <v-icon icon="mdi-arrow-left" size="21" aria-hidden="true" /></RouterLink>
    </section>
  </div>
</template>

<script setup lang="ts">
import { RouterLink } from "vue-router";
</script>
