---
layout: single
author_profile: true
title: Welcome
excerpt: "I am a person with full of curiosity. I pursue everyone's happiness and healthiness."
header:
  overlay_image: /assets/img/chamonix.jpeg
  overlay_filter: 0.4
---
<meta http-equiv="cache-control" content="no-cache" />
<meta http-equiv="expires" content="0" />
<meta http-equiv="pragma" content="no-cache" />

## Hello. Nice to meet you!

In this website, I would like to introduce myself and share my daily experiences.
The contents are kinds of random, but you might enjoy if you have some time to look around.
Please take a look with comfort mind and have a nice day! :)

{% include figure
   image_path="/assets/img/bicycle.jpeg"
   alt="bicycle"
%}

## Recent Posts
<div class="recent-cards">
{% for post in site.posts limit:5 %}
  <a class="recent-card" href="{{ post.url | relative_url }}">
    <div class="recent-card-title">{{ post.title }}</div>
    <div class="recent-card-meta">
      {{ post.date | date: "%Y.%m.%d" }}
    </div>
  </a>
{% endfor %}
</div>
