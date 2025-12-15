---
layout: single
author_profile: true
title: Welcome
excerpt: "I am a person with full of curiosity. I pursue everyone's happiness and healthiness."
header:
  overlay_image: /assets/img/chamonix.jpeg
  overlay_filter: 0.4
show_home_recent: true
---
<meta http-equiv="cache-control" content="no-cache" />
<meta http-equiv="expires" content="0" />
<meta http-equiv="pragma" content="no-cache" />



## Hello. Nice to meet you!

In this website, I would like to introduce myself and share my daily experiences.
The contents are kinds of random, but you might enjoy if you have some time to look around.
Please take a look with comfort mind and have a nice day! :)

안녕하세요. 저의 블로그에 오신 것을 환영합니다. 다양한 주제의 글이 있으니 편하게 둘러보셨으면 좋겠습니다. 행복한 하루 되세요! :)

<figure>
  <img src="/assets/img/bicycle.jpeg" alt="bicycle">
</figure>

<div class="home-recent">
<h2 class="recent-title">Recently Updated</h2>
<div class="recent-cards">
{% assign recent_posts = site.posts | sort: "last_modified_at" | reverse %}
{% for post in recent_posts limit: 4 %}
  <a class="recent-card" href="{{ post.url | relative_url }}">
    <div class="recent-card-title">{{ post.title }}</div>
    <div class="recent-card-meta">
      {{ post.date | date: "%Y.%m.%d" }}
    </div>
  </a>
{% endfor %}
</div>
</div>

